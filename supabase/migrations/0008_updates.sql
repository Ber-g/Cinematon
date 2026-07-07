-- Cinematon — Mises à jour & résilience (Phase 4, F10), côté modèle + dashboard.
--
-- On modélise le DÉPLOIEMENT (quelle version pousser sur quelles cabines, statut,
-- rollback) + la fenêtre de MAJ par cabine. L'AGENT DEVICE (télécharger, appliquer
-- dans la fenêtre, redémarrer, watchdog, rollback réel) reste côté borne = différé,
-- mais la borne étant désormais connectée, elle pourra lire ses `booth_updates`.
--
-- ⚠️ À appliquer sur Supabase (après 0001-0007). Idempotent.

-- ── Releases (versions logicielles à déployer, org-scoped) ────────────────────
create table if not exists public.releases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version         text not null,
  urgency         text not null default 'normal' check (urgency in ('normal', 'urgent')),
  notes           text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists releases_org_idx on public.releases (organization_id);

-- ── État de déploiement d'une release sur une cabine ──────────────────────────
create table if not exists public.booth_updates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booth_id        uuid not null references public.booths (id) on delete cascade,
  release_id      uuid not null references public.releases (id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'scheduled', 'applying', 'applied', 'failed', 'rolled_back')),
  scheduled_for   timestamptz,
  applied_at      timestamptz,
  error           text not null default '',
  created_at      timestamptz not null default now(),
  unique (booth_id, release_id)
);
create index if not exists booth_updates_org_idx on public.booth_updates (organization_id);
create index if not exists booth_updates_booth_idx on public.booth_updates (booth_id);

-- Fenêtre de MAJ par cabine : heure locale (~3h) où les MAJ non urgentes s'appliquent.
alter table public.booths
  add column if not exists maintenance_hour int not null default 3;

-- ── RLS : mêmes règles tenant que les autres tables (helpers 0002/0006) ───────
do $$
declare t text;
begin
  foreach t in array array['releases', 'booth_updates'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists %I on public.%I;
      create policy %I on public.%I for select
      using (public.is_global_admin() or organization_id in (select public.current_org_ids()));
    $f$, t || '_select', t, t || '_select', t);
    execute format($f$
      drop policy if exists %I on public.%I;
      create policy %I on public.%I for all
      using (public.can_write_org(organization_id))
      with check (public.can_write_org(organization_id));
    $f$, t || '_write', t, t || '_write', t);
  end loop;
end $$;
