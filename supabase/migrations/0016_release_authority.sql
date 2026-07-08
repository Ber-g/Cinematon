-- Kioskoscope — CIN-016(b) : autorité sur les releases.
--
-- Une release (version logicielle) est FABRIQUÉE par la plateforme (global_admin), pas
-- par un client. Un `super_user` client **déploie/planifie** une version existante
-- (via `booth_updates`, inchangé) mais ne **crée** pas de version. Sécurise le modèle :
-- la version d'une borne = réalité remontée par le heartbeat, et les versions publiables
-- ne sont pas inventées côté client.
--
-- Lecture inchangée (`releases_select` de 0008) : un client VOIT les releases de son org
-- pour les déployer. Seule l'ÉCRITURE (create/update/delete) passe en global_admin only.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0015). Idempotent.

alter table public.releases enable row level security;

drop policy if exists releases_write on public.releases;
create policy releases_write on public.releases for all
  using (public.is_global_admin())
  with check (public.is_global_admin());

-- `booth_updates_write` (déploiement/planification) reste `can_write_org` : le client
-- déploie une version existante sur ses bornes. On ne le touche pas.
