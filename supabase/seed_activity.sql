-- Cinematon — données d'ACTIVITÉ de démo (facultatif, à passer après seed.sql).
-- Génère 14 jours d'historique + des transactions du jour + des alertes pour
-- CHAQUE cabine existante (sans référencer d'ID en dur — via sous-requêtes).
-- Objectif : que les KPI et graphes du dashboard affichent de vraies valeurs.

-- 14 jours de stats journalières par cabine.
insert into public.daily_stats (booth_id, organization_id, date, sessions, bandwidth_mb)
select b.id, b.organization_id, (current_date - g.i), (5 + floor(random() * 20))::int, (1000 + floor(random() * 4000))::int
from public.booths b
cross join generate_series(0, 13) as g(i)
on conflict (booth_id, date) do nothing;

-- Quelques transactions aujourd'hui par cabine (revenus).
insert into public.transactions (organization_id, booth_id, amount_cents, currency, provider, created_at)
select b.organization_id, b.id, 500, 'EUR', 'mock', now()
from public.booths b
cross join generate_series(1, 5) as g(i);

-- Une alerte d'exemple par cabine (visible dans le détail — journaux).
insert into public.alerts (organization_id, booth_id, severity, message)
select b.organization_id, b.id, 'info', 'Heartbeat OK'
from public.booths b;
