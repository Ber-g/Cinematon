# Kioskoscope — Backend (Supabase)

Le « backend » de Kioskoscope = **Supabase** (PostgreSQL managé + Auth + API
auto-générée + Edge Functions) plutôt qu'un serveur à maintenir. L'**isolation
multi-organisations** est imposée par la base via **Row-Level Security (RLS)** —
pas par l'application (exigence de sécurité de premier rang).

> ⚠️ Le SQL de ce dossier n'a **pas** été exécuté en local (pas de Postgres sur la
> machine de dev). Il est écrit pour être appliqué sur un projet Supabase.

## Contenu

```
supabase/
  migrations/
    0001_schema.sql   Tables (organization_id partout) + trigger profil Auth
    0002_rls.sql      RLS : isolation par organisation + bypass global_admin
  seed.sql            Données de démo (facultatif)
```

## Appliquer (2 options)

**A. Éditeur SQL Supabase (le plus simple pour commencer)**
1. Créer un projet sur https://supabase.com (free tier).
2. SQL Editor → coller `0001_schema.sql` → Run, puis `0002_rls.sql` → Run.
3. (Option) coller `seed.sql` → Run.

**B. CLI Supabase (recommandé ensuite, versionné)**
```bash
npm i -g supabase
supabase link --project-ref <ref-du-projet>
supabase db push         # applique les migrations
```

## Comment l'isolation fonctionne (RLS)

- Chaque table tenant-scoped porte `organization_id`.
- Policies uniformes :
  - **Lecture** : l'utilisateur voit une ligne seulement si son org en fait partie
    (`organization_id in current_org_ids()`), ou s'il est `global_admin`.
  - **Écriture** : réservée aux rôles `super_user` / `manager` de l'org (ou global_admin).
- Fonctions d'aide : `is_global_admin()`, `current_org_ids()`, `can_write_org()`
  (toutes `security definer` → pas de récursion de policy).
- **Debug/shell machine** : hors RLS — réservé `global_admin`, imposé côté Edge
  Functions (à venir).

## Premier global_admin

Après ta première inscription via l'Auth Supabase :
```sql
update public.users set is_global_admin = true where email = 'toi@exemple.com';
```

## À venir (Phase 1, suite)

- **Storage vidéos** : Cloudflare R2 (S3-compatible, egress gratuit) — bucket privé.
- **Edge Functions** (TypeScript/Deno) : heartbeat Kiosks, page publique
  `/s/{share_token}`, envoi batch de médias, signature de fichiers, conso LTE.
- **Branchement du dashboard** sur le client Supabase (données réelles → remplace
  le mock, RLS applique l'isolation).
