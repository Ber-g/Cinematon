-- Cinematon — régions & intégrations de paiement (anticipation phase rue).
--
-- Modèle : **1 organisation = 1 région** (mono-région par org ; échappatoire future =
-- descendre `region` au niveau `booth` si un jour une org couvre plusieurs régions).
-- La RLS par org isole donc déjà chaque région. `currency` pilote le formatage.
--
-- Paiement : le RUNTIME est déjà abstrait (UnlockAdapter côté cabine + transactions.
-- provider/provider_ref). Ici on ajoute la COUCHE DE CONFIGURATION : quel provider
-- utilise chaque org, avec quels réglages NON-SECRETS.
--
-- ⚠️ SÉCURITÉ (@qa) : cette table ne contient JAMAIS de secret (clé API, token). Les
-- secrets vivent côté serveur (Supabase Vault / env d'Edge Function) ; `secret_ref`
-- n'est qu'un NOM pointant vers le secret, pas le secret lui-même.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0004). Idempotent.

-- ── Région & devise sur l'organisation ───────────────────────────────────────
alter table public.organizations
  add column if not exists region   text,
  add column if not exists currency text not null default 'EUR';

-- ── Intégrations de paiement (config non-secrète, scoping org) ────────────────
create table if not exists public.payment_integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('mock', 'free', 'coin', 'stripe_terminal', 'sumup')),
  mode            text not null default 'test'     check (mode in ('test', 'live')),
  status          text not null default 'inactive' check (status in ('active', 'inactive', 'error')),
  label           text not null default '',
  config          jsonb not null default '{}'::jsonb, -- NON-SECRET : id de terminal, libellé de compte, devise…
  secret_ref      text,                               -- NOM du secret côté serveur (jamais le secret)
  created_at      timestamptz not null default now(),
  unique (organization_id, provider, mode)
);
create index if not exists payment_integrations_org_idx on public.payment_integrations (organization_id);

-- ── RLS : mêmes règles que les autres tables tenant-scoped (helpers de 0002) ──
alter table public.payment_integrations enable row level security;

create policy payment_integrations_select on public.payment_integrations for select
  using (public.is_global_admin() or organization_id in (select public.current_org_ids()));

create policy payment_integrations_write on public.payment_integrations for all
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));
