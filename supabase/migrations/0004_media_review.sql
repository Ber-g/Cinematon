-- Cinematon — validation humaine d'un média (F8).
-- « Vidéo validée par l'opérateur » : trace QUI a validé et QUAND (audit).
-- `reviewed_at` non nul = média validé. La RLS existante (policy `media_write`,
-- can_write_org) couvre déjà l'UPDATE de ces colonnes — aucune policy à ajouter.
--
-- ⚠️ À appliquer sur Supabase (après 0001/0002). Idempotent.

alter table public.media
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.users (id) on delete set null;
