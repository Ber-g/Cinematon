-- Kioskoscope — Accès opérateur cabine (CIN-073, volet A de F17).
--
-- Le menu opérateur d'une Kiosk (Wi-Fi/réglages) DOIT s'ouvrir HORS LIGNE : on ne
-- peut donc pas rejouer un login Supabase. Modèle : le back-office gère une table
-- d'accès (identifiant structuré NON secret + PIN haché) ; la Kiosk en garde un
-- cache local (poussé quand elle est en ligne) et valide le PIN hors ligne (cf.
-- booth-client/src/setup/auth.ts : PBKDF2-SHA256, sel par entrée, temps ~constant).
--
-- Le secret est le PIN — jamais stocké en clair, ici ni sur la Kiosk : seule
-- l'empreinte (pin_hash + salt + iterations) circule. Le device lit les empreintes
-- de SON org uniquement (RLS) pour pouvoir vérifier hors ligne ; une fuite du cache
-- n'expose qu'un PBKDF2 à coût élevé d'un PIN (tradeoff assumé, cf. auth.ts).
--
-- Révocation / expiration = eventually consistent : effectives à la prochaine sync
-- du cache. Le PIN reste le fallback toujours disponible hors ligne.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0014). Idempotent (ré-exécutable).

-- ── Trigger updated_at commun (posé ici, réutilisable) ────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Table des accès opérateur ─────────────────────────────────────────────────
-- Un accès appartient à une org. booth_id null = valable sur TOUTES les Kiosks de
-- l'org ; renseigné = restreint à cette Kiosk.
create table if not exists public.operator_access (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid references public.booths (id) on delete cascade,
  -- Identifiant structuré, non secret (ex. « PERCHOIR-CAB001-OP »). Unique par org.
  identifier      text not null,
  -- Empreinte PBKDF2-SHA256 du PIN (hex) + sel par entrée (hex) + coût. Jamais le PIN.
  pin_hash        text not null,
  salt            text not null,
  iterations      integer not null default 210000 check (iterations >= 100000),
  role            text not null check (role in ('operator', 'super_user', 'global_admin')),
  -- Expiration optionnelle (horloge Kiosk à la vérif) ; révocation immédiate côté back.
  expires_at      timestamptz,
  revoked         boolean not null default false,
  -- Note libre back-office (« bénévole festival », « gérant »…). Non poussée au cache.
  label           text not null default '',
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, identifier)
);
create index if not exists operator_access_org_idx on public.operator_access (organization_id);
create index if not exists operator_access_booth_idx on public.operator_access (booth_id);

drop trigger if exists trg_operator_access_updated_at on public.operator_access;
create trigger trg_operator_access_updated_at
  before update on public.operator_access
  for each row execute function public.set_updated_at();

-- ── Journal d'accès ───────────────────────────────────────────────────────────
-- Bufferisé hors ligne sur la Kiosk (accessCache.ts) puis poussé (drain) quand en
-- ligne. `at` = horodatage Kiosk (peut dater d'une période offline) ; `created_at`
-- = réception serveur. Append-only : jamais d'UPDATE/DELETE par le device.
create table if not exists public.operator_access_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid references public.booths (id) on delete set null,
  at              timestamptz not null,
  identifier      text,
  action          text not null,   -- login_ok | login_fail | wifi_connect | restart | …
  detail          text,
  created_at      timestamptz not null default now()
);
create index if not exists operator_access_log_org_idx on public.operator_access_log (organization_id, at desc);
create index if not exists operator_access_log_booth_idx on public.operator_access_log (booth_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.operator_access enable row level security;
alter table public.operator_access_log enable row level security;

-- Humains : lecture scoping org ; écriture = admins d'org (super_user/manager) ou
-- global_admin (via can_write_org). operator/viewer ne gèrent PAS les accès.
drop policy if exists operator_access_select on public.operator_access;
create policy operator_access_select on public.operator_access for select
  using (public.is_global_admin() or organization_id in (select public.current_org_ids()));

drop policy if exists operator_access_write on public.operator_access;
create policy operator_access_write on public.operator_access for all
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));

-- Device (Kiosk) : lit UNIQUEMENT les accès de SON org, portée booth (null = toute
-- l'org, sinon SA cabine). Additive (OR) avec les policies humaines. Un compte
-- non-device voit device_org() = null → cette policy ne lui accorde rien.
drop policy if exists operator_access_device_select on public.operator_access;
create policy operator_access_device_select on public.operator_access for select
  using (
    organization_id = public.device_org()
    and (booth_id is null or booth_id = public.current_device_booth())
  );

-- Journal : humains lisent leur org (consultation back-office). Le device INSÈRE
-- pour SA cabine et rien d'autre ; il ne relit pas le journal (write-only device).
drop policy if exists operator_access_log_select on public.operator_access_log;
create policy operator_access_log_select on public.operator_access_log for select
  using (public.is_global_admin() or organization_id in (select public.current_org_ids()));

drop policy if exists operator_access_log_device_insert on public.operator_access_log;
create policy operator_access_log_device_insert on public.operator_access_log for insert
  with check (
    organization_id = public.device_org()
    and (booth_id is null or booth_id = public.current_device_booth())
  );
