-- Cinematon — données d'activité MÉDIA de démo (facultatif, à passer après seed.sql).
-- Objectif : que le dashboard médias (F8) affiche de vraies valeurs (top 10 lectures)
-- et que l'envoi batch ait des cibles (un support de stockage par cabine).
--
-- Crée : 1 disque local par cabine · des sessions sur 14 j · des lectures (plays)
-- tirées au hasard parmi les médias de la MÊME organisation que la cabine.
-- Idempotent-ish : ne fait rien si des lectures existent déjà.
--
-- ⚠️ À appliquer sur Supabase (SQL editor), après 0001/0002 + seed.sql.

do $$
begin
  if exists (select 1 from public.plays limit 1) then
    raise notice 'plays déjà présents — seed activité média ignoré.';
    return;
  end if;

  -- 1 disque local par cabine (cible par défaut de l'envoi batch).
  insert into public.storage_locations (organization_id, booth_id, type, label, capacity_bytes, free_bytes)
  select b.organization_id, b.id, 'local', 'Disque interne', 512000000000, 300000000000
  from public.booths b
  where not exists (
    select 1 from public.storage_locations sl where sl.booth_id = b.id and sl.type = 'local'
  );

  -- Sessions : ~8 par cabine, réparties sur 14 jours. Uniquement pour les cabines
  -- dont l'organisation possède au moins un média (sinon pas de lecture possible).
  insert into public.sessions (organization_id, booth_id, started_at, ended_at, share_token, unlock_method)
  select b.organization_id, b.id,
         now() - (floor(random() * 14) || ' days')::interval,
         now(),
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
         'mock'
  from public.booths b
  cross join generate_series(1, 8) as g(i)
  where exists (select 1 from public.media m where m.organization_id = b.organization_id);

  -- Lectures : 1 à 3 par session, médias tirés au hasard dans l'org de la session.
  insert into public.plays (organization_id, session_id, media_id, position, started_at, completed, source)
  select s.organization_id, s.id, pick.id, pick.rn - 1,
         s.started_at + (pick.rn * interval '4 minutes'),
         true,
         case when random() < 0.5 then 'user_choice' else 'recommendation' end
  from public.sessions s
  cross join lateral (
    select m.id, row_number() over () as rn
    from public.media m
    where m.organization_id = s.organization_id
    order by random()
    limit (1 + floor(random() * 3))::int
  ) as pick;

  raise notice 'Seed activité média appliqué.';
end
$$;
