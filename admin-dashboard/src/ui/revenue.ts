import type { FleetStore } from "../data/store";
import { el, formatMoney, icon } from "./dom";
import { t } from "../i18n";
import { timeSeriesChart } from "./chart";

// Vue Revenus (F9). Agrège les transactions (scopées RLS) : KPI, évolution 30 j,
// répartition par Kiosk (et par organisation pour un global_admin), liste des
// dernières transactions. La conso data LTE (F9) est différée en phase rue.

function kpiTile(label: string, value: string, hue: string, iconPath: string): HTMLElement {
  return el("div", { class: "col-sm-6 col-xl-3" }, [
    el("div", { class: "card card-sm" }, [
      el("div", { class: "card-body" }, [
        el("div", { class: "row align-items-center" }, [
          el("div", { class: "col-auto" }, [el("span", { class: `bg-${hue}-lt text-${hue} avatar` }, [icon(iconPath, 22)])]),
          el("div", { class: "col" }, [
            el("div", { class: "fs-2 fw-bold lh-1" }, [value]),
            el("div", { class: "text-secondary" }, [label]),
          ]),
        ]),
      ]),
    ]),
  ]);
}

/** Table de répartition « libellé → montant » avec barre de proportion. */
function breakdownCard(title: string, rows: ReadonlyArray<{ label: string; cents: number; currency: string }>): HTMLElement {
  const max = Math.max(1, ...rows.map((r) => r.cents));
  const body =
    rows.length === 0
      ? el("div", { class: "card-body text-secondary" }, ["Aucune donnée."])
      : el("div", { class: "table-responsive" }, [
          el("table", { class: "table table-vcenter card-table" }, [
            el("tbody", {}, rows.map((r) =>
              el("tr", {}, [
                el("td", { class: "fw-bold" }, [r.label]),
                el("td", { class: "text-end text-nowrap" }, [formatMoney(r.cents, r.currency)]),
                el("td", { class: "w-50" }, [
                  el("div", { class: "progress progress-sm" }, [
                    el("div", { class: "progress-bar", style: `width:${Math.round((r.cents / max) * 100)}%`, role: "progressbar" }, []),
                  ]),
                ]),
              ]),
            )),
          ]),
        ]);
  return el("div", { class: "card h-100" }, [el("div", { class: "card-header" }, [el("h3", { class: "card-title m-0" }, [title])]), body]);
}

// CIN-045 : `opts.boothId` filtre la vue sur une seule cabine (hub par cabine) ;
// `opts.embedded` masque le gros titre de page quand la vue est rendue dans un onglet.
export function revenuePage(store: FleetStore, opts: { boothId?: string; embedded?: boolean } = {}): HTMLElement {
  const { boothId, embedded = false } = opts;
  const tx = boothId ? store.transactionsList().filter((t) => t.boothId === boothId) : store.transactionsList();
  const booths = store.visibleBooths();
  const orgs = store.organizations();
  const boothLabel = new Map(booths.map((b) => [b.id, b.label]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  // Devise de la vue (org active ; 1 org = 1 région = 1 devise). EUR par défaut.
  const viewCurrency = store.activeCurrency();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const dayOf = (createdAt: number): string => new Date(createdAt).toISOString().slice(0, 10);

  const sum = (list: typeof tx): number => list.reduce((n, t) => n + t.amountCents, 0);
  const totalCents = sum(tx);
  const todayCents = sum(tx.filter((t) => dayOf(t.createdAt) === todayStr));
  const monthCents = sum(tx.filter((t) => dayOf(t.createdAt).startsWith(monthStr)));

  // Série 30 jours (revenu quotidien, en cents → formatMoney).
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const byDay = new Map<string, number>();
  for (const t of tx) byDay.set(dayOf(t.createdAt), (byDay.get(dayOf(t.createdAt)) ?? 0) + t.amountCents);
  const points = days.map((d) => ({ date: d, value: byDay.get(d) ?? 0 }));

  // Répartition par Kiosk.
  const byBooth = new Map<string, number>();
  for (const t of tx) byBooth.set(t.boothId, (byBooth.get(t.boothId) ?? 0) + t.amountCents);
  const boothRows = [...byBooth.entries()]
    .map(([id, cents]) => ({ label: boothLabel.get(id) ?? "—", cents, currency: viewCurrency }))
    .sort((a, b) => b.cents - a.cents);

  // Répartition par organisation (utile seulement pour un global_admin multi-org).
  const byOrg = new Map<string, number>();
  for (const t of tx) byOrg.set(t.organizationId, (byOrg.get(t.organizationId) ?? 0) + t.amountCents);
  const orgRows = [...byOrg.entries()]
    .map(([id, cents]) => ({ label: orgName.get(id) ?? "—", cents, currency: store.orgCurrency(id) }))
    .sort((a, b) => b.cents - a.cents);
  const showOrgBreakdown = store.isGlobalAdmin && byOrg.size > 1;

  // Dernières transactions (50 max).
  const recent = tx.slice(0, 50);
  const txTable =
    recent.length === 0
      ? el("div", { class: "card-body text-secondary text-center py-5" }, ["Aucune transaction pour l'instant."])
      : el("div", { class: "table-responsive" }, [
          el("table", { class: "table table-vcenter card-table" }, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["Date"]), el("th", {}, ["Kiosk"]), el("th", { class: "text-end" }, ["Montant"]), el("th", {}, ["Fournisseur"])])]),
            el("tbody", {}, recent.map((t) =>
              el("tr", {}, [
                el("td", { class: "text-secondary text-nowrap" }, [new Date(t.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })]),
                el("td", {}, [boothLabel.get(t.boothId) ?? "—"]),
                el("td", { class: "text-end fw-bold text-nowrap" }, [formatMoney(t.amountCents, t.currency)]),
                el("td", {}, [el("span", { class: "badge bg-secondary-lt" }, [t.provider])]),
              ]),
            )),
          ]),
        ]);

  return el("div", {}, [
    embedded
      ? el("span", {}, [])
      : el("div", { class: "mb-3" }, [
          el("h2", { class: "page-title m-0" }, [t("page.revenue")]),
          el("div", { class: "text-secondary" }, [store.isGlobalAdmin ? "Toutes les organisations (global admin)." : "Revenus de votre organisation.", " · Conso data LTE : reportée (phase rue)."]),
        ]),
    el("div", { class: "row row-cards g-2 mb-3" }, [
      kpiTile("Revenu total", formatMoney(totalCents, viewCurrency), "teal", "M12 3v18M8 7h6a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h6"),
      kpiTile("Ce mois", formatMoney(monthCents, viewCurrency), "green", "M4 5h16v16H4zM4 9h16M8 3v4M16 3v4"),
      kpiTile("Aujourd'hui", formatMoney(todayCents, viewCurrency), "azure", "M12 7v5l3 3M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18"),
      kpiTile("Transactions", String(tx.length), "purple", "M8 4v16M16 4v16M4 8h16M4 16h16"),
    ]),
    el("div", { class: "card mb-3" }, [el("div", { class: "card-body" }, [timeSeriesChart({ title: "Revenu — 30 derniers jours", points, kind: "area", hue: "var(--tblr-teal)", formatValue: (n) => formatMoney(n, viewCurrency) })])]),
    boothId
      ? el("span", {}, [])
      : el("div", { class: "row row-cards mb-3" }, [
          el("div", { class: showOrgBreakdown ? "col-lg-6" : "col-12" }, [breakdownCard("Revenu par Kiosk", boothRows)]),
          ...(showOrgBreakdown ? [el("div", { class: "col-lg-6" }, [breakdownCard("Revenu par organisation", orgRows)])] : []),
        ]),
    el("div", { class: "card" }, [el("div", { class: "card-header" }, [el("h3", { class: "card-title m-0" }, ["Dernières transactions"])]), txTable]),
  ]);
}
