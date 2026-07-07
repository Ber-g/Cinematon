-- Kioskoscope — page publique de partage de séance (CIN-020, F5).
--
-- Le QR de fin de séance pointe /s/{share_token}. Une Edge Function sert cette route
-- (service_role, contourne la RLS). Pour éviter qu'une erreur d'implémentation ne fuite
-- des données d'org/PII, la PROJECTION SÛRE est encapsulée ICI : cette fonction ne
-- renvoie QUE les champs affichables publiquement (films + date), JAMAIS booth/org/
-- montant/token. Défense en profondeur : même en service_role, on passe par cette forme.
--
-- Réservée à service_role (donc uniquement joignable par l'Edge Function) : on n'ouvre
-- PAS de surface publique anonyme sur sessions/plays. Token inconnu ⇒ 0 ligne (aucun
-- signal d'énumération). Idempotent.

create or replace function public.session_recap(p_token text)
returns table (
  started_at  timestamptz,
  "position"  int,           -- quoté : `position` est un mot-clé SQL réservé (ERROR 42601 sinon)
  title       text,
  year        int,
  director    text,
  source      text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.started_at, p.position, m.title, m.year, m.director, p.source
  from public.sessions s
  join public.plays p on p.session_id = s.id
  join public.media m on m.id = p.media_id
  where s.share_token = p_token
  order by p.position;
$$;

-- Verrou d'accès : personne par défaut, seul service_role (l'Edge Function) exécute.
revoke all on function public.session_recap(text) from public;
revoke all on function public.session_recap(text) from anon;
revoke all on function public.session_recap(text) from authenticated;
grant execute on function public.session_recap(text) to service_role;
