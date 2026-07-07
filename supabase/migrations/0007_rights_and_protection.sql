-- Cinematon — Droits de diffusion & redevances (Concept 2) + Protection du contenu (Concept 1).
--
-- Concept 2 : distributeurs + licences par média (termes : redevance, % partage, plafond de
-- séances, période). Le journal de vision est `plays` (via session.booth_id → par cabine).
-- Plafond org-wide par défaut ; **par machine** si `license_booths` est peuplé.
-- Concept 1 : le média porte le FAIT d'être protégé ; la **DRM est liée à la BORNE SIGNÉE**
-- (chaque booth = device signé avec sa clé/cert côté serveur — jamais la clé en base).
--
-- Rappel région : 1 org = 1 région → une licence par (org, média) encode déjà la région ;
-- même film sur 2 régions = 2 orgs = 2 licences (distributeurs différents possibles).
--
-- ⚠️ À appliquer sur Supabase (après 0001-0006). Idempotent.

-- ── Concept 2 : distributeurs & licences ─────────────────────────────────────
create table if not exists public.distributors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  territory       text not null default '',   -- libellé de territoire (redondant avec org.region, explicite)
  contact_email   text not null default '',
  notes           text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists distributors_org_idx on public.distributors (organization_id);

create table if not exists public.media_licenses (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  media_id               uuid not null references public.media (id) on delete cascade,
  distributor_id         uuid references public.distributors (id) on delete set null,
  royalty_model          text not null default 'free' check (royalty_model in ('free', 'per_screening', 'revenue_share', 'flat')),
  royalty_cents          int not null default 0,          -- pour per_screening
  revenue_share_pct      numeric not null default 0,      -- pour revenue_share (0-100)
  minimum_guarantee_cents int,                            -- pour flat (ou MG)
  max_screenings         int,                             -- null = illimité (cap org-wide par défaut)
  valid_from             date,
  valid_to               date,
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  unique (organization_id, media_id)                      -- une licence active par média
);
create index if not exists media_licenses_org_idx on public.media_licenses (organization_id);
create index if not exists media_licenses_media_idx on public.media_licenses (media_id);

-- Scope/plafond PAR MACHINE (optionnel). Vide → licence org-wide. Peuplé → ne vaut que pour
-- ces cabines, avec cap par cabine.
create table if not exists public.license_booths (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  license_id      uuid not null references public.media_licenses (id) on delete cascade,
  booth_id        uuid not null references public.booths (id) on delete cascade,
  max_screenings  int,
  unique (license_id, booth_id)
);
create index if not exists license_booths_license_idx on public.license_booths (license_id);

-- ── RLS : mêmes règles tenant que les autres tables (helpers 0002) ────────────
do $$
declare t text;
begin
  foreach t in array array['distributors', 'media_licenses', 'license_booths'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists %I on public.%I;
      create policy %I on public.%I for select
      using (public.is_global_admin() or organization_id in (select public.current_org_ids()));
    $f$, t || '_select', t, t || '_select', t);
    execute format($f$
      drop policy if exists %I on public.%I;
      create policy %I on public.%I for all
      using (public.can_write_org(organization_id))
      with check (public.can_write_org(organization_id));
    $f$, t || '_write', t, t || '_write', t);
  end loop;
end $$;

-- ── Concept 1 : protection du contenu ────────────────────────────────────────
-- Le média : le fichier EST protégé ou non.
alter table public.media
  add column if not exists protection       text not null default 'none' check (protection in ('none', 'encrypted', 'drm')),
  add column if not exists drm_scheme        text,   -- widevine | playready | fairplay | custom (libre)
  add column if not exists source_protected  boolean not null default false;  -- master livré déjà protégé

-- La borne : MACHINE SIGNÉE porteuse de la DRM (clé/cert device côté serveur — jamais en base).
alter table public.booths
  add column if not exists device_key_ref text,        -- NOM d'une clé/cert côté serveur (pas la clé)
  add column if not exists signed_at       timestamptz; -- null = borne non signée
