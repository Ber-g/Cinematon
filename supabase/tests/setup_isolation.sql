-- Cinematon — setup des comptes de test d'isolation (à exécuter dans le SQL editor
-- Supabase, APRÈS avoir créé les 2 utilisateurs dans Authentication → Add user).
--
-- Ce script est idempotent (on conflict do nothing) et NE crée PAS les utilisateurs :
-- les users viennent de l'Auth (trigger handle_new_user → public.users). Il se contente
-- de leur attribuer une appartenance super_user à UNE org distincte chacun.
--
-- ⚠️ Les 2 comptes doivent rester NON global_admin (is_global_admin = false, défaut) :
--    un global_admin bypasse la RLS et invalide la preuve.

-- Adapte les emails si besoin (doivent correspondre à ISO_A_EMAIL / ISO_B_EMAIL).
-- User A → org …a1 (Le Perchoir) ; User B → org …a2 (Le Comptoir Général).

insert into public.memberships (user_id, organization_id, role)
select u.id, '00000000-0000-0000-0000-0000000000a1', 'super_user'
from public.users u
where u.email = 'iso-a@cinematon.test'
on conflict (user_id, organization_id) do nothing;

insert into public.memberships (user_id, organization_id, role)
select u.id, '00000000-0000-0000-0000-0000000000a2', 'super_user'
from public.users u
where u.email = 'iso-b@cinematon.test'
on conflict (user_id, organization_id) do nothing;

-- Filet de sécurité : s'assurer que les comptes de test ne sont pas global_admin.
update public.users set is_global_admin = false
where email in ('iso-a@cinematon.test', 'iso-b@cinematon.test');

-- Vérification (doit renvoyer 2 lignes : chaque user, son org, role super_user, admin=false).
select u.email, m.organization_id, m.role, u.is_global_admin
from public.users u
join public.memberships m on m.user_id = u.id
where u.email in ('iso-a@cinematon.test', 'iso-b@cinematon.test')
order by u.email;
