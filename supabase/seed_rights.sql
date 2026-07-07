-- Cinematon — données de démo Droits & redevances (facultatif, après 0007 + seed_media_activity).
-- Crée un distributeur + des licences sur les médias a1 pour que le rapport montre :
--   Aurora  → per_screening, plafond 5 (8 séances seedées → « au plafond »)
--   Vertige → revenue_share 30% (illimité)
--   frontVideo (upload réel) → reste « sans licence »
-- ⚠️ À appliquer sur Supabase (SQL editor). Idempotent (ne fait rien si des licences existent).

do $$
declare dist_id uuid; aurora uuid; vertige uuid;
begin
  if exists (select 1 from public.media_licenses limit 1) then
    raise notice 'licences déjà présentes — seed droits ignoré.';
    return;
  end if;

  insert into public.distributors (organization_id, name, territory, contact_email)
  values ('00000000-0000-0000-0000-0000000000a1', 'Distrib Court-Métrage FR', 'France', 'contact@distrib.test')
  returning id into dist_id;

  select id into aurora from public.media
    where organization_id = '00000000-0000-0000-0000-0000000000a1' and content_hash = 'seedhash-aurora';
  select id into vertige from public.media
    where organization_id = '00000000-0000-0000-0000-0000000000a1' and content_hash = 'seedhash-vertige';

  if aurora is not null then
    insert into public.media_licenses (organization_id, media_id, distributor_id, royalty_model, royalty_cents, max_screenings, valid_to)
    values ('00000000-0000-0000-0000-0000000000a1', aurora, dist_id, 'per_screening', 200, 5, current_date + 365);
  end if;
  if vertige is not null then
    insert into public.media_licenses (organization_id, media_id, distributor_id, royalty_model, revenue_share_pct)
    values ('00000000-0000-0000-0000-0000000000a1', vertige, dist_id, 'revenue_share', 30);
  end if;

  raise notice 'Seed droits appliqué.';
end $$;
