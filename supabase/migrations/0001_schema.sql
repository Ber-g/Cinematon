-- Kioskoscope — schéma initial (Phase 1).
-- Modèle multi-organisations. RÈGLE : `organization_id` sur TOUTE table
-- tenant-scoped (dénormalisé sur les enfants) pour des policies RLS uniformes.
-- Enums = text + CHECK (évolutif : "rien de rigide"). uuid via gen_random_uuid().
--
-- ⚠️ Non exécuté en local (pas de Postgres ici) — à appliquer sur Supabase.

-- ── Organisations ────────────────────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('bar', 'festival', 'event')),
  settings    jsonb not null default '{"whitelistTags": []}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ── Utilisateurs (profil lié à l'auth Supabase) ──────────────────────────────
create table public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text not null default '',
  email           text not null default '',
  is_global_admin boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── Appartenances (user × org × rôle) ────────────────────────────────────────
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role            text not null check (role in ('super_user', 'manager', 'operator', 'viewer')),
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);

-- ── Kiosks ──────────────────────────────────────────────────────────────────
create table public.booths (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  label             text not null,
  location          text not null default '',
  address           text not null default '',
  gps_lat           double precision,
  gps_lng           double precision,
  health            text not null default 'offline'
                      check (health in ('operational', 'attention', 'error', 'offline', 'maintenance')),
  indicators        text[] not null default '{}',
  software_version  text not null default '',
  last_heartbeat_at timestamptz,
  telemetry         jsonb not null default '{}'::jsonb, -- snapshot (temp, cpu, storage, connexion…)
  notes             text not null default '',
  created_at        timestamptz not null default now()
);
create index on public.booths (organization_id);

-- ── Supports de stockage physiques (par Kiosk) ──────────────────────────────
create table public.storage_locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid not null references public.booths (id) on delete cascade,
  type            text not null check (type in ('local', 'usb', 'object')),
  label           text not null default '',
  capacity_bytes  bigint not null default 0,
  free_bytes      bigint not null default 0
);
create index on public.storage_locations (booth_id);

-- ── Médias ───────────────────────────────────────────────────────────────────
create table public.media (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  content_hash     text not null,                 -- SHA-256 : dedup + intégrité
  title            text not null,
  year             int,
  duration_seconds int not null default 0,
  storage_url      text,
  version          int not null default 1,
  active           boolean not null default true,
  tmdb_id          bigint,
  genres           text[] not null default '{}',
  moods            text[] not null default '{}',
  tags             text[] not null default '{}',  -- éditoriaux
  audience_tags    text[] not null default '{}',  -- whitelist (18+, enfant…)
  language         text not null default 'fr',
  director         text not null default '',
  synopsis         text not null default '',
  stills           text[] not null default '{}',
  learn_more_url   text,
  created_at       timestamptz not null default now(),
  -- Anti-doublons : même fichier interdit DANS une organisation.
  unique (organization_id, content_hash)
);
create index on public.media (organization_id);

-- ── Sous-titres ──────────────────────────────────────────────────────────────
create table public.subtitles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  media_id        uuid not null references public.media (id) on delete cascade,
  lang            text not null,
  format          text not null check (format in ('vtt', 'srt')),
  url             text not null,
  workflow_status text not null default 'todo' check (workflow_status in ('todo', 'rework', 'verified'))
);
create index on public.subtitles (media_id);

-- ── Présence physique d'un média sur un support ──────────────────────────────
create table public.media_instances (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  media_id            uuid not null references public.media (id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations (id) on delete cascade,
  unique (media_id, storage_location_id)
);

-- ── Sessions (parcours multi-films) ──────────────────────────────────────────
create table public.sessions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  booth_id              uuid not null references public.booths (id) on delete cascade,
  started_at            timestamptz not null default now(),
  ended_at              timestamptz,
  share_token           text not null unique,     -- secret de capacité (≥128 bits)
  unlock_method         text not null check (unlock_method in ('mock', 'card', 'coin', 'token', 'free')),
  amount_cents          int,
  payment_provider_ref  text
);
create index on public.sessions (organization_id);
create index on public.sessions (booth_id);

-- ── Lectures (un film joué dans une session) ─────────────────────────────────
create table public.plays (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id      uuid not null references public.sessions (id) on delete cascade,
  media_id        uuid not null references public.media (id) on delete restrict,
  position        int not null default 0,
  started_at      timestamptz not null default now(),
  completed       boolean not null default false,
  source          text not null check (source in ('user_choice', 'recommendation'))
);
create index on public.plays (session_id);
create index on public.plays (media_id);

-- ── Transactions (revenus) ───────────────────────────────────────────────────
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid not null references public.booths (id) on delete cascade,
  session_id      uuid references public.sessions (id) on delete set null,
  amount_cents    int not null,
  currency        text not null default 'EUR',
  provider        text not null default 'mock',
  provider_ref    text,
  created_at      timestamptz not null default now()
);
create index on public.transactions (organization_id);

-- ── Alertes ──────────────────────────────────────────────────────────────────
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid references public.booths (id) on delete cascade,
  severity        text not null check (severity in ('info', 'warn', 'error', 'critical')),
  message         text not null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index on public.alerts (organization_id);

-- ── Stats journalières (graphes) ─────────────────────────────────────────────
create table public.daily_stats (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid not null references public.booths (id) on delete cascade,
  date            date not null,
  sessions        int not null default 0,
  bandwidth_mb    int not null default 0,
  primary key (booth_id, date)
);

-- ── Création automatique du profil à l'inscription (Auth → public.users) ─────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
