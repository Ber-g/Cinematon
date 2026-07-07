-- Kioskoscope — gestion d'organisation & RBAC (menu Organisation).
--
-- Jusqu'ici (0002) un super_user ne pouvait NI voir NI gérer les membres de son org
-- (memberships/users = self-only ; memberships_write = global_admin only). Cette
-- migration ouvre la gestion de SON org au super_user, avec garde-fous anti-escalade,
-- et ajoute les invitations (sans Edge Function : fonction security-definer + lien).
--
-- 4 rôles fixes : super_user > manager > operator > viewer. `global_admin` = plateforme.
-- ⚠️ À appliquer sur Supabase (après 0001-0005). Idempotent (create or replace / if exists).

-- ── Helpers ───────────────────────────────────────────────────────────────────

-- Suis-je super_user de cette org (ou global_admin) ?
create or replace function public.is_org_super_user(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or exists (
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = org and role = 'super_user'
  );
$$;

-- Partage-t-on au moins une org avec cet utilisateur ? (visibilité de la liste des membres)
create or replace function public.shares_org(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = target_user
  );
$$;

-- ── RLS révisée : users / memberships ─────────────────────────────────────────

-- Profil visible : le sien, celui d'un co-membre d'une org partagée, ou global_admin.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (id = auth.uid() or public.shares_org(id));

-- Appartenances visibles : les siennes, celles des orgs dont on est membre, ou global_admin.
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select
  using (
    user_id = auth.uid()
    or organization_id in (select public.current_org_ids())
    or public.is_global_admin()
  );

-- Écriture des appartenances : super_user de l'org concernée (ou global_admin).
-- Note : `role` est déjà contraint à {super_user,manager,operator,viewer} → aucune
-- escalade vers `global_admin` possible via cette table (global_admin vit sur users).
drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships for all
  using (public.is_org_super_user(organization_id))
  with check (public.is_org_super_user(organization_id));

-- Garde-fou : ne jamais laisser une org sans aucun super_user (retrait/rétrogradation).
create or replace function public.guard_last_super_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare org uuid; remaining int;
begin
  if TG_OP = 'DELETE' then
    if OLD.role <> 'super_user' then return OLD; end if;
    org := OLD.organization_id;
  else -- UPDATE
    if OLD.role <> 'super_user' or NEW.role = 'super_user' then return NEW; end if;
    org := OLD.organization_id;
  end if;
  select count(*) into remaining from public.memberships
    where organization_id = org and role = 'super_user' and id <> OLD.id;
  if remaining = 0 then
    raise exception 'Impossible de retirer le dernier super_user de l''organisation';
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists trg_guard_last_super_user on public.memberships;
create trigger trg_guard_last_super_user
  before update or delete on public.memberships
  for each row execute function public.guard_last_super_user();

-- ── Resserrage : réglages org & paiement = super_user only ────────────────────
-- (contenu/Kiosks restent super_user+manager via can_write_org ; membres/org/billing
--  sont réservés au super_user, pour coller à la matrice de permissions du menu.)
drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations for all
  using (public.is_org_super_user(id))
  with check (public.is_org_super_user(id));

drop policy if exists payment_integrations_write on public.payment_integrations;
create policy payment_integrations_write on public.payment_integrations for all
  using (public.is_org_super_user(organization_id))
  with check (public.is_org_super_user(organization_id));

-- ── Invitations ───────────────────────────────────────────────────────────────
create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('super_user', 'manager', 'operator', 'viewer')),
  token           text not null unique,                 -- secret de capacité (≥128 bits, généré côté app)
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '14 days'),
  accepted_at     timestamptz
);
create index if not exists invitations_org_idx on public.invitations (organization_id);

alter table public.invitations enable row level security;
-- Seul le super_user de l'org gère ses invitations. L'invité ne lit PAS la table :
-- il passe par la fonction `accept_invitation` (security definer) avec son token.
drop policy if exists invitations_manage on public.invitations;
create policy invitations_manage on public.invitations for all
  using (public.is_org_super_user(organization_id))
  with check (public.is_org_super_user(organization_id));

-- Acceptation : valide le token (usage unique, non expiré, e-mail correspondant) et
-- crée l'appartenance. `security definer` → contourne la RLS memberships proprement.
create or replace function public.accept_invitation(invite_token text)
returns void language plpgsql security definer set search_path = public as $$
declare inv public.invitations; uid uuid; uemail text;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifié'; end if;
  select email into uemail from auth.users where id = uid;
  select * into inv from public.invitations where token = invite_token;
  if inv.id is null then raise exception 'Invitation introuvable'; end if;
  if inv.status <> 'pending' then raise exception 'Invitation déjà traitée'; end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'Invitation expirée';
  end if;
  if lower(inv.email) <> lower(coalesce(uemail, '')) then
    raise exception 'Cette invitation ne correspond pas à votre adresse e-mail';
  end if;
  insert into public.memberships (user_id, organization_id, role)
    values (uid, inv.organization_id, inv.role)
    on conflict (user_id, organization_id) do update set role = excluded.role;
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
end;
$$;
grant execute on function public.accept_invitation(text) to authenticated;
