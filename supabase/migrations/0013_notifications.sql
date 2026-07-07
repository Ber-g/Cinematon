-- Cinematon — Notifications & préférences (F15, « prépare le terrain »).
-- Modèle piloté par un CATALOGUE code (registry TS) : `type` est une clé libre,
-- pas un enum figé → ajouter un type ne nécessite AUCUNE migration.
-- Préférences à l'échelle du USER (globales, tous orgs confondus) — décision produit.
-- Livraison MVP = in-app par polling ; Realtime activable plus tard sans toucher ce schéma.

-- ── notifications ─────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  type            text not null,
  severity        text not null default 'info' check (severity in ('critical', 'warning', 'info')),
  title           text not null,
  body            text not null default '',
  booth_id        uuid references public.booths(id) on delete set null,
  data            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Cloche : « mes non-lues, récentes d'abord » + historique récent.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

-- ── notification_preferences ─────────────────────────────────────────────────
-- Sparse : une ligne = un OVERRIDE du user pour un type. Absence ⇒ défauts catalogue.
-- `channels` vide ⇒ notif désactivée (muette) pour ce type.
create table if not exists public.notification_preferences (
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null,
  channels   text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

-- ── RLS : STRICTEMENT scopée au destinataire ─────────────────────────────────
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- Policies ré-exécutables (re-run sans erreur si déjà présentes).
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert_admin on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
drop policy if exists notification_prefs_all on public.notification_preferences;

-- Un user ne lit QUE ses propres notifications (global_admin voit tout).
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid() or public.is_global_admin());

-- Création : système (Edge Function en service_role, contourne la RLS). On ouvre
-- l'insert uniquement au global_admin pour les tests / envois manuels depuis le back-office.
create policy notifications_insert_admin on public.notifications for insert
  with check (public.is_global_admin());

-- Le user ne peut qu'ACQUITTER (marquer lu) ses propres notifs.
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Purge de ses propres notifs (global_admin peut tout purger).
create policy notifications_delete on public.notifications for delete
  using (user_id = auth.uid() or public.is_global_admin());

-- Préférences : le user gère EXCLUSIVEMENT les siennes.
create policy notification_prefs_all on public.notification_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
