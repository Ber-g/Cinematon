-- Cinematon — données de démo (facultatif). Reflète le mock du dashboard.
-- Les UTILISATEURS viennent de l'Auth Supabase (inscription) ; on ne les seede pas.
-- Après inscription, passer un compte en global_admin :
--   update public.users set is_global_admin = true where email = 'toi@exemple.com';

insert into public.organizations (id, name, type, settings) values
  ('00000000-0000-0000-0000-0000000000a1', 'Le Perchoir', 'bar', '{"whitelistTags":["bar","18+"]}'),
  ('00000000-0000-0000-0000-0000000000a2', 'Le Comptoir Général', 'bar', '{"whitelistTags":["bar"]}'),
  ('00000000-0000-0000-0000-0000000000a3', 'Collectif Lyon', 'festival', '{"whitelistTags":["festival","18+"]}'),
  ('00000000-0000-0000-0000-0000000000a4', 'La Cantine du Voyage', 'event', '{"whitelistTags":["event","enfant"]}')
on conflict (id) do nothing;

insert into public.booths (organization_id, label, location, address, health, software_version, indicators) values
  ('00000000-0000-0000-0000-0000000000a1', 'Cinematon — Le Perchoir', 'Paris 11e', 'Paris 11e · Bar Le Perchoir', 'operational', '0.2.0', '{powered,in_use}'),
  ('00000000-0000-0000-0000-0000000000a2', 'Cinematon — Comptoir Général', 'Paris 10e', 'Paris 10e · Le Comptoir Général', 'attention', '0.2.0', '{powered}'),
  ('00000000-0000-0000-0000-0000000000a3', 'Cinematon — La Commune', 'Lyon 7e', 'Lyon 7e · La Commune', 'error', '0.1.9', '{powered}'),
  ('00000000-0000-0000-0000-0000000000a4', 'Cinematon — La Cantine', 'Nantes', 'Nantes · La Cantine du Voyage', 'operational', '0.2.0', '{powered}');

insert into public.media (organization_id, content_hash, title, year, duration_seconds, language, genres, moods, audience_tags, director, synopsis) values
  ('00000000-0000-0000-0000-0000000000a1', 'seedhash-aurora', 'Aurora', 2021, 480, 'fr', '{drame,contemplatif}', '{apaisant,mélancolique}', '{bar}', 'Camille Roy', 'Une veilleuse de nuit traverse une ville endormie.'),
  ('00000000-0000-0000-0000-0000000000a1', 'seedhash-vertige', 'Vertige', 2022, 180, 'fr', '{expérimental,thriller}', '{tendu,énergique}', '{bar,18+}', 'Sacha Novak', 'Trois minutes en apnée au bord du vide.');
