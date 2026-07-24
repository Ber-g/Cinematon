-- Kioskoscope — assets de marque d'organisation « Mes styles » v2 (F19 v2).
--
-- Bucket PUBLIC `org-assets` : logos (clair/sombre), image d'attente, bandeau. Ces fichiers ne sont
-- PAS sensibles et doivent être lus par la BORNE sans URL signée (affichage écran d'attente) → bucket
-- public en lecture. L'ÉCRITURE reste réservée au super_user de l'org (comme le style lui-même,
-- cf. org_styles), scopée par le 1er segment du chemin :
--   chemin = "{organization_id}/{kind}.webp"   (kind ∈ logo-light | logo-dark | idle | banner)
--
-- ⚠️ À appliquer sur Supabase (après 0018). Idempotent (re-exécutable).

insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "org_assets_read" on storage.objects;
drop policy if exists "org_assets_insert" on storage.objects;
drop policy if exists "org_assets_update" on storage.objects;
drop policy if exists "org_assets_delete" on storage.objects;

-- Lecture : PUBLIQUE (bucket public — la borne lit le logo/l'image sans authentification).
create policy "org_assets_read" on storage.objects for select
using (bucket_id = 'org-assets');

-- Écriture (insert/update/delete) : super_user de l'org dont l'id préfixe le chemin, OU global_admin.
create policy "org_assets_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'org-assets' and (
    public.is_global_admin()
    or public.is_org_super_user((storage.foldername(name))[1]::uuid)
  )
);

create policy "org_assets_update" on storage.objects for update to authenticated
using (
  bucket_id = 'org-assets' and (
    public.is_global_admin()
    or public.is_org_super_user((storage.foldername(name))[1]::uuid)
  )
)
with check (
  bucket_id = 'org-assets' and (
    public.is_global_admin()
    or public.is_org_super_user((storage.foldername(name))[1]::uuid)
  )
);

create policy "org_assets_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'org-assets' and (
    public.is_global_admin()
    or public.is_org_super_user((storage.foldername(name))[1]::uuid)
  )
);
