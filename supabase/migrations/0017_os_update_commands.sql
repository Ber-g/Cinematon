-- Kioskoscope — CIN-077 : canal de commande MAJ OS (back-office → borne).
--
-- L'agent local expose déjà `POST /system/os-update` (apt update && upgrade, liste blanche)
-- et `GET /system/os-update/status`. Il manquait le CANAL : comment le back-office demande
-- un patch, et comment la borne remonte le résultat. Cette table est ce canal.
--
-- Une commande = « patche l'OS de CETTE borne ». Le dashboard qui vise « tout le parc » crée
-- N lignes (une par borne) → statut par borne, révocable/rejouable individuellement. Le
-- `booth-client` (device authentifié) relaie : lit les commandes `pending` de SA borne, appelle
-- l'agent local, remonte `running` → `done`/`failed` + le journal apt.
--
-- Autorité (aligné CIN-016/0016) : la PLATEFORME décide des patchs. L'ÉCRITURE humaine est
-- réservée `global_admin` ; un client VOIT l'état de ses bornes mais ne déclenche pas de patch
-- OS. Le device met à jour SA ligne (statut/journal) et rien d'autre.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0016). Idempotent.

create table if not exists public.os_update_commands (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid not null references public.booths (id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'running', 'done', 'failed')),
  packages_pending int,                       -- nb de paquets en attente (remonté par la borne)
  requested_by    uuid references public.users (id) on delete set null,
  requested_at    timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  log             text not null default '',   -- queue de sortie apt (relayée par la borne)
  error           text not null default ''
);
create index if not exists os_update_commands_org_idx on public.os_update_commands (organization_id);
create index if not exists os_update_commands_booth_idx on public.os_update_commands (booth_id);
-- Une seule commande active par borne à la fois (évite les doublons de déclenchement).
create unique index if not exists os_update_commands_active_uidx
  on public.os_update_commands (booth_id)
  where status in ('pending', 'running');

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.os_update_commands enable row level security;

-- Lecture humaine : global_admin, ou membre de l'org (voit l'état des patchs de ses bornes).
drop policy if exists os_update_commands_select on public.os_update_commands;
create policy os_update_commands_select on public.os_update_commands for select
  using (public.is_global_admin() or organization_id in (select public.current_org_ids()));

-- Écriture humaine : global_admin UNIQUEMENT (la plateforme décide des patchs OS — CIN-016).
drop policy if exists os_update_commands_write on public.os_update_commands;
create policy os_update_commands_write on public.os_update_commands for all
  using (public.is_global_admin())
  with check (public.is_global_admin());

-- Device : lit les commandes de SA borne (relais).
drop policy if exists os_update_commands_device_select on public.os_update_commands;
create policy os_update_commands_device_select on public.os_update_commands for select
  using (booth_id = public.current_device_booth());

-- Device : met à jour SA commande (statut/journal/horodatage) — jamais celle d'une autre borne.
drop policy if exists os_update_commands_device_update on public.os_update_commands;
create policy os_update_commands_device_update on public.os_update_commands for update
  using (booth_id = public.current_device_booth())
  with check (booth_id = public.current_device_booth());
