-- Kioskoscope — style d'organisation « Mes styles » (F19, seam OrgStyle posé en F13).
--
-- Une org (super_user) définit le style de SES cabines ; la borne le CONSOMME (lecture seule),
-- le super-admin (global_admin) peut le borner / réinitialiser. Table dédiée (comme
-- `org_entitlements`) pour un contrôle d'écriture net, sans toucher aux policies d'`organizations`.
--
-- ⚠️ PAS DE LIGNE = STYLE MAÎTRE Kioskoscope (défaut applicatif). On ne backfill pas : une org
-- sans ligne rend le style maître. La précédence côté cabine reste maître < org < humeur.
--
-- Colonnes jsonb = forme du type `OrgStyle` (@kioskoscope/domain), tous les slots optionnels :
--   palette : {bg,surface,surfaceRaised,accent,accent2,text,textEmphasis}
--   fonts   : {display,body,ui}
--   assets  : {logoLight,logoDark,idleImage,banner}  (v2 — la cabine les ignore en v1)
--
-- ⚠️ À appliquer sur Supabase (après 0001-0017). Idempotent.

create table if not exists public.org_styles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  palette   jsonb,
  fonts     jsonb,
  assets    jsonb,
  title     text,
  updated_at timestamptz not null default now()
);

alter table public.org_styles enable row level security;

-- Lecture : global_admin (tout) OU membre de l'org (son style) OU la BORNE de l'org (device),
-- pour que la cabine charge SON style au boot (helper device_org() de CIN-002).
drop policy if exists org_styles_select on public.org_styles;
create policy org_styles_select on public.org_styles for select
  using (
    public.is_global_admin()
    or organization_id in (select public.current_org_ids())
    or organization_id = public.device_org()
  );

-- Écriture : super_user de l'org (pose le style de SON org) OU global_admin (bornage/reset F20).
-- Une org ne peut écrire QUE sa propre ligne (with check sur la même org).
drop policy if exists org_styles_write on public.org_styles;
create policy org_styles_write on public.org_styles for all
  using (public.is_global_admin() or public.is_org_super_user(organization_id))
  with check (public.is_global_admin() or public.is_org_super_user(organization_id));
