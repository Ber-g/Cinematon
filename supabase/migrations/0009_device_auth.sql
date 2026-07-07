-- Cinematon — durcissement de l'auth cabine (CIN-002).
--
-- Jusqu'ici la borne réutilisait un compte à droits d'écriture (super_user/manager) —
-- sur-privilégié (finding @qa HIGH). Ici : un **compte device dédié, SANS membership**,
-- lié à SA cabine par `booths.device_user_id`. Des policies device MINIMALES lui donnent
-- exactement ce qu'il faut, et rien d'autre.
--
-- Ces policies sont ADDITIVES (OR avec les policies existantes) → les comptes humains
-- (super_user/manager) continuent de fonctionner à l'identique. Un compte non-device voit
-- `current_device_booth()` = null → les policies device ne lui accordent rien.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0008). Idempotent.

-- Compte device (auth user) lié à cette cabine. Une cabine = un device.
alter table public.booths
  add column if not exists device_user_id uuid references public.users (id) on delete set null;
create index if not exists booths_device_user_idx on public.booths (device_user_id);

-- Helpers (security definer → contournent la RLS pour résoudre l'identité device).
create or replace function public.current_device_booth()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.booths where device_user_id = auth.uid() limit 1;
$$;

create or replace function public.device_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.booths where device_user_id = auth.uid() limit 1;
$$;

-- ── Policies device (minimales) ───────────────────────────────────────────────

-- Lecture : catalogue (médias) + versions (releases) de SON org uniquement.
drop policy if exists media_device_select on public.media;
create policy media_device_select on public.media for select
  using (organization_id = public.device_org());

drop policy if exists releases_device_select on public.releases;
create policy releases_device_select on public.releases for select
  using (organization_id = public.device_org());

-- Écriture : séances de SA cabine + lectures de son org (les plays des séances qu'il crée).
drop policy if exists sessions_device_insert on public.sessions;
create policy sessions_device_insert on public.sessions for insert
  with check (booth_id = public.current_device_booth());

drop policy if exists plays_device_insert on public.plays;
create policy plays_device_insert on public.plays for insert
  with check (organization_id = public.device_org());

-- MAJ : le device lit et met à jour les déploiements de SA cabine (applique/rollback).
drop policy if exists booth_updates_device_select on public.booth_updates;
create policy booth_updates_device_select on public.booth_updates for select
  using (booth_id = public.current_device_booth());

drop policy if exists booth_updates_device_update on public.booth_updates;
create policy booth_updates_device_update on public.booth_updates for update
  using (booth_id = public.current_device_booth())
  with check (booth_id = public.current_device_booth());

-- Heartbeat : le device met à jour SA cabine (version + dernier contact). Row-level scopé
-- à sa propre borne ; le booth-client ne modifie que version/last_heartbeat_at.
drop policy if exists booths_device_update on public.booths;
create policy booths_device_update on public.booths for update
  using (id = public.current_device_booth())
  with check (id = public.current_device_booth());
