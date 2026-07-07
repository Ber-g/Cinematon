-- Kioskoscope — feature gating par organisation (CIN-080, F18).
--
-- Fondation de la modularité SaaS : chaque org a un TYPE DE SOUSCRIPTION + une liste de
-- MODULES activés, pilotés par le SUPER-ADMIN uniquement. L'org lit sa config en read-only
-- et NE PEUT PAS se l'auto-modifier (levier commercial de l'exploitant).
--
-- Table dédiée (plutôt que des colonnes sur `organizations`) pour un contrôle d'écriture net :
-- write = global_admin only, sans toucher aux policies d'update d'`organizations` (que le
-- super_user d'org utilise pour ses propres réglages).
--
-- ⚠️ PAS DE LIGNE = TOUS LES MODULES ACTIFS (défaut ouvert, applicatif). On ne backfill donc
-- pas : « tout le monde a tout » tant que le super-admin n'a pas restreint une org.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0010). Idempotent.

create table if not exists public.org_entitlements (
  organization_id   uuid primary key references public.organizations (id) on delete cascade,
  subscription_type text not null default 'demo'
    check (subscription_type in ('free_flat', 'subscription', 'per_screening', 'demo')),
  enabled_modules   text[] not null default array['rights', 'personalization'],
  updated_at        timestamptz not null default now()
);

alter table public.org_entitlements enable row level security;

-- Lecture : membre de l'org (voit sa propre config) OU global_admin (voit tout).
drop policy if exists org_entitlements_select on public.org_entitlements;
create policy org_entitlements_select on public.org_entitlements for select
  using (public.is_global_admin() or organization_id in (select public.current_org_ids()));

-- Écriture : global_admin UNIQUEMENT. Une org ne peut pas changer sa souscription/ses modules.
drop policy if exists org_entitlements_write on public.org_entitlements;
create policy org_entitlements_write on public.org_entitlements for all
  using (public.is_global_admin())
  with check (public.is_global_admin());
