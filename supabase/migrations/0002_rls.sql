-- Cinematon — Row-Level Security (Phase 1).
-- L'ISOLATION MULTI-ORG EST IMPOSÉE PAR LA BASE, pas par l'application (exigence
-- de premier rang F7). Chaque table tenant-scoped n'est lisible/écrivable que
-- pour les membres de l'organisation ; `global_admin` contourne.
--
-- Modèle : lecture = tout membre de l'org ; écriture = super_user/manager ; le
-- debug/shell des machines n'est PAS ici (réservé global_admin, imposé côté
-- Edge Functions). Operator/viewer = lecture seule via ces policies.

-- ── Fonctions d'aide ─────────────────────────────────────────────────────────

-- L'utilisateur courant est-il global_admin ?
create function public.is_global_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_global_admin from public.users where id = auth.uid()), false);
$$;

-- Organisations dont l'utilisateur courant est membre.
create function public.current_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from public.memberships where user_id = auth.uid();
$$;

-- L'utilisateur a-t-il un rôle d'écriture (super_user/manager) sur cette org ?
create function public.can_write_org(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or exists (
        select 1 from public.memberships
        where user_id = auth.uid()
          and organization_id = org
          and role in ('super_user', 'manager')
      );
$$;

-- ── Application uniforme des policies sur les tables tenant-scoped ────────────
-- Chaque table a `organization_id` → une même paire de policies partout.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'organizations', 'booths', 'storage_locations', 'media', 'subtitles',
    'media_instances', 'sessions', 'plays', 'transactions', 'alerts', 'daily_stats'
  ];
  org_col text;
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security;', t);

    -- `organizations` se scope sur sa propre colonne `id`, les autres sur `organization_id`.
    org_col := case when t = 'organizations' then 'id' else 'organization_id' end;

    -- Lecture : membre de l'org (ou global_admin).
    execute format($f$
      create policy %I on public.%I for select
      using (public.is_global_admin() or %I in (select public.current_org_ids()));
    $f$, t || '_select', t, org_col);

    -- Écriture (insert/update/delete) : rôle d'écriture sur l'org (ou global_admin).
    execute format($f$
      create policy %I on public.%I for all
      using (public.can_write_org(%I))
      with check (public.can_write_org(%I));
    $f$, t || '_write', t, org_col, org_col);
  end loop;
end;
$$;

-- ── users / memberships : règles spécifiques ─────────────────────────────────
alter table public.users enable row level security;
alter table public.memberships enable row level security;

-- Un utilisateur lit son propre profil ; global_admin lit tout.
create policy users_select on public.users for select
  using (id = auth.uid() or public.is_global_admin());

-- Un utilisateur lit ses propres appartenances ; global_admin lit tout.
create policy memberships_select on public.memberships for select
  using (user_id = auth.uid() or public.is_global_admin());

-- Seul global_admin gère les appartenances (attribution de rôles/orgs).
create policy memberships_write on public.memberships for all
  using (public.is_global_admin())
  with check (public.is_global_admin());

-- NB : la route publique de partage `/s/{share_token}` (lecture d'une séance par
-- token) sera servie par une Edge Function en `service_role` (contourne la RLS),
-- qui ne renvoie QUE la liste des films — jamais de données d'org. Pas de policy
-- publique ici : on n'ouvre pas `sessions`/`plays` en lecture anonyme.
