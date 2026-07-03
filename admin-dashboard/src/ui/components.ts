import type { Booth, HealthStatus } from "../domain/types";
import { allHealthStatuses, healthMeta, indicatorLabel } from "../domain/status";
import { el, formatMoney, icon, relativeTime } from "./dom";

// Composants d'affichage réutilisables (statut, KPI, cartes, tableau, répartition).

/** Badge de santé : couleur + ICÔNE + LIBELLÉ (jamais couleur seule — a11y). */
export function healthBadge(status: HealthStatus): HTMLElement {
  const m = healthMeta(status);
  return el("span", { class: `badge bg-${m.color}-lt d-inline-flex align-items-center gap-1`, title: m.hint }, [
    icon(m.iconPath, 16),
    el("span", {}, [m.label]),
  ]);
}

/** Pastille d'indicateur (sous tension, en cours…). */
export function indicatorChips(booth: Booth): HTMLElement {
  const chips = booth.indicators.map((ind) =>
    el("span", { class: "badge bg-secondary-lt" }, [indicatorLabel(ind)]),
  );
  return el("span", { class: "d-inline-flex flex-wrap gap-1" }, chips.length ? chips : [el("span", { class: "text-secondary" }, ["—"])]);
}

// ── Tuiles KPI (stat tiles — des hero numbers, pas des graphes gadgets) ──────
export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly color: string; // couleur Tabler pour l'accent
  readonly iconPath: string;
}

export function computeKpis(booths: readonly Booth[]): Kpi[] {
  const count = (s: HealthStatus): number => booths.filter((b) => b.health === s).length;
  const sessions = booths.reduce((n, b) => n + b.sessionsToday, 0);
  const revenue = booths.reduce((n, b) => n + b.revenueTodayCents, 0);
  return [
    { label: "Cabines", value: String(booths.length), color: "azure", iconPath: "M4 21v-13l8 -4l8 4v13M9 21v-6h6v6" },
    { label: "Opérationnelles", value: String(count("operational")), color: "green", iconPath: "M5 12l5 5l10 -10" },
    { label: "Attention", value: String(count("attention")), color: "yellow", iconPath: "M12 9v4M12 16v.01M12 3l9 16H3z" },
    { label: "En panne / hors-ligne", value: String(count("error") + count("offline")), color: "red", iconPath: "M12 9v4M12 16v.01M12 3l9 16H3z" },
    { label: "Sessions (aujourd'hui)", value: String(sessions), color: "purple", iconPath: "M8 4v16M16 4v16M4 8h16M4 16h16" },
    { label: "Revenu (aujourd'hui)", value: formatMoney(revenue), color: "teal", iconPath: "M12 3v18M8 7h6a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h6" },
  ];
}

export function kpiTile(kpi: Kpi): HTMLElement {
  return el("div", { class: "card card-sm h-100" }, [
    el("div", { class: "card-body" }, [
      el("div", { class: "row align-items-center" }, [
        el("div", { class: "col-auto" }, [
          el("span", { class: `bg-${kpi.color}-lt text-${kpi.color} avatar` }, [icon(kpi.iconPath, 22)]),
        ]),
        el("div", { class: "col" }, [
          el("div", { class: "fs-2 fw-bold lh-1" }, [kpi.value]),
          el("div", { class: "text-secondary" }, [kpi.label]),
        ]),
      ]),
    ]),
  ]);
}

// ── Répartition des statuts (barre horizontale empilée, libellée) ────────────
export function statusDistribution(booths: readonly Booth[]): HTMLElement {
  const total = booths.length || 1;
  const segments = allHealthStatuses()
    .map((s) => ({ status: s, n: booths.filter((b) => b.health === s).length }))
    .filter((seg) => seg.n > 0);

  const bar = el(
    "div",
    { class: "progress progress-separated mb-3" },
    segments.map((seg) => {
      const m = healthMeta(seg.status);
      return el("div", {
        class: `progress-bar bg-${m.color}`,
        role: "progressbar",
        style: `width: ${(seg.n / total) * 100}%`,
        title: `${m.label} : ${seg.n}`,
      });
    }),
  );

  const legend = el(
    "div",
    { class: "row g-2" },
    segments.map((seg) => {
      const m = healthMeta(seg.status);
      return el("div", { class: "col-auto" }, [
        el("span", { class: "d-inline-flex align-items-center gap-1" }, [
          el("span", { class: `badge bg-${m.color} p-1` }, []),
          el("span", { class: "text-secondary" }, [`${m.label} · ${seg.n}`]),
        ]),
      ]);
    }),
  );

  return el("div", { class: "card h-100" }, [
    el("div", { class: "card-header" }, [el("h3", { class: "card-title" }, ["Répartition de la flotte"])]),
    el("div", { class: "card-body" }, [bar, legend]),
  ]);
}

// ── Carte cabine ──────────────────────────────────────────────────────────────
export function boothCard(booth: Booth, onOpen: (id: string) => void): HTMLElement {
  const card = el("div", { class: "card h-100 card-link cursor-pointer", role: "button", tabindex: "0" }, [
    el("div", { class: "card-body" }, [
      el("div", { class: "d-flex align-items-start justify-content-between mb-2" }, [
        el("div", {}, [
          el("div", { class: "fw-bold" }, [booth.label]),
          el("div", { class: "text-secondary small" }, [booth.location]),
        ]),
        healthBadge(booth.health),
      ]),
      indicatorChips(booth),
      el("div", { class: "row mt-3 text-secondary small" }, [
        el("div", { class: "col" }, [`${booth.sessionsToday} sessions`]),
        el("div", { class: "col text-end" }, [relativeTime(booth.lastHeartbeatAt)]),
      ]),
    ]),
  ]);
  const open = (): void => onOpen(booth.id);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  return card;
}

// ── Tableau des cabines ───────────────────────────────────────────────────────
export function boothTable(booths: readonly Booth[], onOpen: (id: string) => void): HTMLElement {
  const rows = booths.map((b) => {
    const tr = el("tr", { class: "cursor-pointer" }, [
      el("td", {}, [el("div", { class: "fw-bold" }, [b.label]), el("div", { class: "text-secondary small" }, [b.location])]),
      el("td", {}, [healthBadge(b.health)]),
      el("td", {}, [indicatorChips(b)]),
      el("td", { class: "text-secondary" }, [String(b.sessionsToday)]),
      el("td", { class: "text-secondary" }, [formatMoney(b.revenueTodayCents)]),
      el("td", { class: "text-secondary" }, [b.softwareVersion]),
      el("td", { class: "text-secondary" }, [relativeTime(b.lastHeartbeatAt)]),
    ]);
    tr.addEventListener("click", () => onOpen(b.id));
    return tr;
  });

  return el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [el("h3", { class: "card-title" }, ["Toutes les cabines"])]),
    el("div", { class: "table-responsive" }, [
      el("table", { class: "table table-vcenter card-table table-hover" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", {}, ["Cabine"]),
            el("th", {}, ["Santé"]),
            el("th", {}, ["Indicateurs"]),
            el("th", {}, ["Sessions"]),
            el("th", {}, ["Revenu"]),
            el("th", {}, ["Version"]),
            el("th", {}, ["Vu"]),
          ]),
        ]),
        el("tbody", {}, rows),
      ]),
    ]),
  ]);
}
