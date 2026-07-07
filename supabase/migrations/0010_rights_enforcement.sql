-- Kioskoscope — enforcement des droits/plafonds côté borne (CIN-010, F15).
--
-- La borne doit EXCLURE de son catalogue les films dont les termes du distributeur ne sont
-- plus respectés POUR ELLE : licence expirée / pas encore valide, Kiosk non autorisée
-- (license_booths peuplé sans cette borne), ou plafond de séances atteint (par Kiosk si
-- scoping machine, sinon org-wide). Le journal de vision est `plays` (séance complétée),
-- rattaché à la Kiosk via `sessions.booth_id`.
--
-- Exposé via une fonction `security definer` : la borne n'a PAS besoin de lire licences/
-- plays/sessions (surface minimale, cf. CIN-002). L'autorisation est vérifiée dans la
-- fonction : appelant = membre de l'org de la borne OU compte device de cette borne.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0009). Idempotent.

create or replace function public.blocked_media_for_booth(p_booth uuid)
returns table (media_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select bo.id as booth_id, bo.organization_id as org_id
    from public.booths bo
    where bo.id = p_booth
      and (
        bo.organization_id in (select public.current_org_ids())  -- membre de l'org de la borne
        or bo.device_user_id = auth.uid()                        -- ou le device de cette borne
      )
  ),
  counts as (
    -- séances COMPLÉTÉES par média : org-wide et pour cette borne
    select
      p.media_id,
      count(*) filter (where p.completed) as org_used,
      count(*) filter (where p.completed and s.booth_id = (select booth_id from b)) as booth_used
    from public.plays p
    join public.sessions s on s.id = p.session_id
    where p.organization_id = (select org_id from b)
    group by p.media_id
  )
  select l.media_id
  from public.media_licenses l
  left join public.license_booths lb
    on lb.license_id = l.id and lb.booth_id = (select booth_id from b)
  left join counts c on c.media_id = l.media_id
  where l.organization_id = (select org_id from b)
    and (
      -- expirée ou pas encore valide
      (l.valid_to is not null and l.valid_to < current_date)
      or (l.valid_from is not null and l.valid_from > current_date)
      -- scoping machine peuplé mais CETTE borne absente → non autorisée
      or (exists (select 1 from public.license_booths x where x.license_id = l.id) and lb.booth_id is null)
      -- plafond par Kiosk atteint
      or (lb.booth_id is not null and lb.max_screenings is not null and coalesce(c.booth_used, 0) >= lb.max_screenings)
      -- plafond org-wide atteint (quand pas de scoping machine)
      or (
        not exists (select 1 from public.license_booths x where x.license_id = l.id)
        and l.max_screenings is not null and coalesce(c.org_used, 0) >= l.max_screenings
      )
    );
$$;

grant execute on function public.blocked_media_for_booth(uuid) to authenticated;
