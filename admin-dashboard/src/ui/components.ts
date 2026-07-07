import type { Booth, HealthStatus } from "../domain/types";
import { allHealthStatuses, connectionMeta, healthMeta, indicatorLabel } from "../domain/status";
import { el, formatMoney, icon, relativeTime } from "./dom";
import { t } from "../i18n";

// Composants d'affichage réutilisables (statut, connexion, KPI, cartes, tableau).

/** Badge de santé : couleur + ICÔNE + LIBELLÉ (jamais couleur seule — a11y). */
export function healthBadge(status: HealthStatus): HTMLElement {
  const m = healthMeta(status);
  return el("span", { class: `badge bg-${m.color}-lt d-inline-flex align-items-center gap-1`, title: m.hint }, [
    icon(m.iconPath, 16),
    el("span", {}, [m.label]),
  ]);
}

/** Connexion : icône Wi-Fi / LTE + libellé + qualité de signal. */
export function connectionBadge(booth: Booth): HTMLElement {
  const m = connectionMeta(booth.telemetry.connection);
  const sig = booth.telemetry.signalPct;
  const tone = sig === 0 ? "text-secondary" : sig < 40 ? "text-yellow" : "text-green";
  return el("span", { class: `d-inline-flex align-items-center gap-1 ${tone}`, title: `Signal ${sig}%` }, [
    icon(m.iconPath, 16),
    el("span", { class: "small" }, [`${m.label} · ${sig}%`]),
  ]);
}

/**
 * Statut de connectivité déduit de la FRAÎCHEUR du heartbeat (F3 : détecter une panne
 * < 5 min). Indépendant du champ `health` stocké — une cabine « opérationnelle » mais
 * silencieuse est en fait hors-ligne.
 */
export function heartbeatBadge(lastHeartbeatAt: number): HTMLElement {
  const min = 60_000;
  const age = lastHeartbeatAt > 0 ? Date.now() - lastHeartbeatAt : Number.POSITIVE_INFINITY;
  const s =
    age < 5 * min
      ? { label: "En ligne", color: "green", hint: "Heartbeat récent (< 5 min)" }
      : age < 30 * min
        ? { label: "Silencieuse", color: "yellow", hint: "Pas de heartbeat depuis > 5 min" }
        : { label: lastHeartbeatAt > 0 ? "Hors-ligne" : "Jamais vue", color: "red", hint: "Pas de heartbeat depuis > 30 min" };
  return el("span", { class: `badge bg-${s.color}-lt`, title: s.hint }, [s.label]);
}

export function indicatorChips(booth: Booth): HTMLElement {
  const chips = booth.indicators.map((ind) => el("span", { class: "badge bg-secondary-lt" }, [indicatorLabel(ind)]));
  return el("span", { class: "d-inline-flex flex-wrap gap-1" }, chips.length ? chips : [el("span", { class: "text-secondary" }, ["—"])]);
}

// ── Tuiles KPI (stat tiles). Certaines filtrent la flotte au clic. ───────────
export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly iconPath: string;
  /** Si présent, cliquer la tuile filtre la vue sur ces statuts ([] = tout). */
  readonly filter?: readonly HealthStatus[];
}

export function computeKpis(booths: readonly Booth[]): Kpi[] {
  const count = (s: HealthStatus): number => booths.filter((b) => b.health === s).length;
  const sessions = booths.reduce((n, b) => n + b.sessionsToday, 0);
  const revenue = booths.reduce((n, b) => n + b.revenueTodayCents, 0);
  return [
    { label: t("kpi.booths"), value: String(booths.length), color: "azure", iconPath: "M4 21v-13l8 -4l8 4v13M9 21v-6h6v6", filter: [] },
    { label: t("kpi.operational"), value: String(count("operational")), color: "green", iconPath: "M5 12l5 5l10 -10", filter: ["operational"] },
    { label: t("kpi.attention"), value: String(count("attention")), color: "yellow", iconPath: "M12 9v4M12 16v.01M12 3l9 16H3z", filter: ["attention"] },
    { label: t("kpi.errorOffline"), value: String(count("error") + count("offline")), color: "red", iconPath: "M12 9v4M12 16v.01M12 3l9 16H3z", filter: ["error", "offline"] },
    { label: t("kpi.sessionsToday"), value: String(sessions), color: "purple", iconPath: "M8 4v16M16 4v16M4 8h16M4 16h16" },
    { label: t("kpi.revenueToday"), value: formatMoney(revenue), color: "teal", iconPath: "M12 3v18M8 7h6a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h6" },
  ];
}

export function kpiTile(kpi: Kpi, active: boolean, clickable: boolean, onClick: () => void): HTMLElement {
  const card = el("div", { class: `card card-sm h-100 ${clickable ? "cursor-pointer kpi-clickable" : ""} ${active ? `kpi-active border-${kpi.color}` : ""}` }, [
    el("div", { class: "card-body" }, [
      el("div", { class: "row align-items-center" }, [
        el("div", { class: "col-auto" }, [el("span", { class: `bg-${kpi.color}-lt text-${kpi.color} avatar` }, [icon(kpi.iconPath, 22)])]),
        el("div", { class: "col" }, [
          el("div", { class: "fs-2 fw-bold lh-1" }, [kpi.value]),
          el("div", { class: "text-secondary" }, [kpi.label]),
        ]),
      ]),
    ]),
  ]);
  if (clickable) {
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", onClick);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    });
  }
  return card;
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
      return el("div", { class: `progress-bar bg-${m.color}`, role: "progressbar", style: `width: ${(seg.n / total) * 100}%`, title: `${m.label} : ${seg.n}` });
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
      el("div", { class: "d-flex align-items-start justify-content-between mb-2 gap-2" }, [
        el("div", { class: "text-truncate", style: "min-width:0" }, [
          el("div", { class: "fw-bold text-truncate", title: booth.label }, [booth.label]),
          el("div", { class: "text-secondary small text-truncate" }, [booth.location]),
        ]),
        el("div", { class: "flex-shrink-0 text-end" }, [
          healthBadge(booth.health),
          el("div", { class: "mt-1" }, [heartbeatBadge(booth.lastHeartbeatAt)]),
          booth.signedAt ? el("div", { class: "mt-1" }, [el("span", { class: "badge bg-green-lt", title: "Machine signée (DRM device)" }, ["✓ signée"])]) : el("span", {}, []),
        ]),
      ]),
      el("div", { class: "d-flex align-items-center justify-content-between mb-2 gap-2" }, [
        el("div", { class: "text-truncate", style: "min-width:0" }, [indicatorChips(booth)]),
        el("div", { class: "flex-shrink-0" }, [connectionBadge(booth)]),
      ]),
      el("div", { class: "row text-secondary small" }, [
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

// ── Tableau des cabines (triable) ─────────────────────────────────────────────
export type SortKey = "label" | "health" | "connection" | "sessions" | "revenue" | "version" | "heartbeat";
export interface SortState {
  readonly key: SortKey;
  readonly dir: "asc" | "desc";
}

const HEALTH_ORDER: Readonly<Record<HealthStatus, number>> = { error: 0, offline: 1, attention: 2, maintenance: 3, operational: 4 };

export function sortBooths(booths: readonly Booth[], sort: SortState): Booth[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const val = (b: Booth): number | string => {
    switch (sort.key) {
      case "label": return b.label.toLowerCase();
      case "health": return HEALTH_ORDER[b.health];
      case "connection": return b.telemetry.connection;
      case "sessions": return b.sessionsToday;
      case "revenue": return b.revenueTodayCents;
      case "version": return b.softwareVersion;
      case "heartbeat": return b.lastHeartbeatAt;
    }
  };
  return [...booths].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

export function boothTable(
  booths: readonly Booth[],
  sort: SortState,
  onSort: (key: SortKey) => void,
  onOpen: (id: string) => void,
): HTMLElement {
  const header = (key: SortKey, label: string): HTMLElement => {
    const active = sort.key === key;
    const arrow = active ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
    const th = el("th", { class: `cursor-pointer user-select-none ${active ? "text-primary" : ""}` }, [`${label}${arrow}`]);
    th.addEventListener("click", () => onSort(key));
    return th;
  };

  const rows = booths.map((b) => {
    const tr = el("tr", { class: "cursor-pointer" }, [
      el("td", {}, [el("div", { class: "fw-bold" }, [b.label]), el("div", { class: "text-secondary small" }, [b.location])]),
      el("td", {}, [healthBadge(b.health)]),
      el("td", {}, [connectionBadge(b)]),
      el("td", { class: "text-secondary" }, [String(b.sessionsToday)]),
      el("td", { class: "text-secondary" }, [formatMoney(b.revenueTodayCents)]),
      el("td", { class: "text-secondary" }, [b.softwareVersion]),
      el("td", {}, [el("div", { class: "d-flex align-items-center gap-2" }, [heartbeatBadge(b.lastHeartbeatAt), el("span", { class: "text-secondary small" }, [relativeTime(b.lastHeartbeatAt)])])]),
    ]);
    tr.addEventListener("click", () => onOpen(b.id));
    return tr;
  });

  return el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [el("h3", { class: "card-title" }, [t("overview.allBooths")])]),
    el("div", { class: "table-responsive" }, [
      el("table", { class: "table table-vcenter card-table table-hover" }, [
        el("thead", {}, [
          el("tr", {}, [
            header("label", "Cabine"),
            header("health", "Santé"),
            header("connection", "Connexion"),
            header("sessions", "Sessions"),
            header("revenue", "Revenu"),
            header("version", "Version"),
            header("heartbeat", "Vu"),
          ]),
        ]),
        el("tbody", {}, rows),
      ]),
    ]),
  ]);
}
