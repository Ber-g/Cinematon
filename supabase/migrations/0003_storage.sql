-- Kioskoscope — Stockage des fichiers médias (Supabase Storage).
-- Bucket PRIVÉ `media`. Les fichiers sont rangés par organisation :
--   chemin = "{organization_id}/{content_hash}"
-- → l'isolation storage réutilise la même logique que la RLS des tables :
--   le 1er segment du chemin (dossier) doit être une org de l'utilisateur.
--
-- ⚠️ À appliquer sur Supabase (après 0001/0002). R2 remplacera ce bucket à
-- l'échelle (egress) ; Supabase Storage suffit pour démarrer (1 Go gratuit).

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Policies ré-exécutables (re-run sans erreur si déjà présentes).
drop policy if exists "media_read" on storage.objects;
drop policy if exists "media_write" on storage.objects;
drop policy if exists "media_delete" on storage.objects;

-- Lecture : membre de l'org propriétaire du dossier (ou global_admin).
create policy "media_read" on storage.objects for select to authenticated
using (
  bucket_id = 'media' and (
    public.is_global_admin()
    or (storage.foldername(name))[1]::uuid in (select public.current_org_ids())
  )
);

-- Upload : rôle d'écriture sur l'org du dossier (ou global_admin).
create policy "media_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'media' and (
    public.is_global_admin()
    or public.can_write_org((storage.foldername(name))[1]::uuid)
  )
);

-- Suppression : idem écriture.
create policy "media_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'media' and (
    public.is_global_admin()
    or public.can_write_org((storage.foldername(name))[1]::uuid)
  )
);
