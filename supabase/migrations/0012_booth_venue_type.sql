-- Cinematon — catégorie de LIEU par cabine (F11 / Phase 5).
--
-- Le « type de lieu » (bar, musée, festival…) est une propriété de la CABINE (là où elle est
-- posée), pas de l'organisation. `organizations.type` reste le type d'ORGANISATION.
-- (Adresse postale + GPS + notes existent déjà sur `booths`.)
--
-- ⚠️ À appliquer sur Supabase (après 0001-0011). Idempotent.

alter table public.booths
  add column if not exists venue_type text;
