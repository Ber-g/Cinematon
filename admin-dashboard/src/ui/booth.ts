import type { FleetStore } from "../data/store";
import type { Booth } from "../domain/types";
import { el, formatMoney, icon } from "./dom";
import { connectionBadge, healthBadge, indicatorChips } from "./components";
import { revenuePage } from "./revenue";
import { sessionsPage } from "./sessions";

// CIN-045 — Hub « booth-centric ». Depuis la vue d'ensemble, « Gérer » une cabine
// ouvre cette page maître-détail : en-tête cabine + onglets qui réutilisent les vues
// par fonction (revenus, séances…) FILTRÉES sur la cabine. Pattern ADDITIF : les vues
// transverses globales du menu latéral restent inchangées.

export type BoothTab = "infos" | "revenue" | "sessions" | "maj" | "media" | "access";

interface TabDef {
  readonly id: BoothTab;
  readonly label: string;
  readonly iconPath: string;
  readonly enabled: boolean;
}

// Onglets prévus par CIN-045. `enabled: false` = structure visible mais pas encore
// livrée (incrément 1 = infos / revenus / séances). On affiche « bientôt » plutôt
// qu'un écran vide, et l'onglet n'est pas cliquable.
const TABS: readonly TabDef[] = [
  { id: "infos", label: "Infos", iconPath: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18M12 8h.01M11 12h1v4h1", enabled: true },
  { id: "revenue", label: "Revenus", iconPath: "M12 3v18M8 7h6a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h6", enabled: true },
  { id: "sessions", label: "Séances", iconPath: "M8 4v16M16 4v16M4 8h16M4 16h16", enabled: true },
  { id: "maj", label: "MAJ", iconPath: "M12 3a9 9 0 1 0 9 9M12 3v6h6", enabled: false },
  { id: "media", label: "Médias", iconPath: "M4 5h16v14H4zM4 9h16M10 13l3 2l-3 2z", enabled: false },
  { id: "access", label: "Accès", iconPath: "M9 5h6a2 2 0 0 1 2 2v12l-5 -3l-5 3v-12a2 2 0 0 1 2 -2z", enabled: false },
];

function meter(label: string, value: number, unit: string, ok: boolean): HTMLElement {
  const color = ok ? "green" : "yellow";
  return el("div", { class: "mb-2" }, [
    el("div", { class: "d-flex justify-content-between small text-secondary" }, [el("span", {}, [label]), el("span", {}, [`${value}${unit}`])]),
    el("div", { class: "progress progress-sm" }, [
      el("div", { class: `progress-bar bg-${color}`, style: `width: ${Math.max(0, Math.min(100, value))}%` }, []),
    ]),
  ]);
}

function factRow(label: string, value: string): HTMLElement {
  return el("div", { class: "col-6 col-md-4 mb-2" }, [
    el("div", { class: "text-secondary small" }, [label]),
    el("div", { class: "fw-bold" }, [value || "—"]),
  ]);
}

// Onglet Infos : chiffres du jour + télémétrie + fiche (adresse/localisation) + Modifier.
// Couvre aussi le volet « adresse & localisation » prévu par CIN-045.
function infosTab(booth: Booth, onEdit: (b: Booth) => void): HTMLElement {
  const tel = booth.telemetry;
  const heartbeat = booth.lastHeartbeatAt
    ? new Date(booth.lastHeartbeatAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
  const gps = booth.gpsLat != null && booth.gpsLng != null ? `${booth.gpsLat.toFixed(5)}, ${booth.gpsLng.toFixed(5)}` : "—";

  const editBtn = el("button", { class: "btn btn-primary", type: "button" }, [icon("M4 20h4l10 -10l-4 -4l-10 10v4", 18), el("span", {}, ["Modifier la cabine"])]);
  editBtn.addEventListener("click", () => onEdit(booth));

  return el("div", { class: "row row-cards" }, [
    el("div", { class: "col-12 col-lg-4" }, [
      el("div", { class: "card h-100" }, [
        el("div", { class: "card-body" }, [
          el("div", { class: "row g-2" }, [
            el("div", { class: "col-6" }, [el("div", { class: "text-secondary small" }, ["Sessions aujourd'hui"]), el("div", { class: "fw-bold fs-2 lh-1" }, [String(booth.sessionsToday)])]),
            el("div", { class: "col-6" }, [el("div", { class: "text-secondary small" }, ["Revenu aujourd'hui"]), el("div", { class: "fw-bold fs-2 lh-1" }, [formatMoney(booth.revenueTodayCents)])]),
          ]),
          el("hr", {}, []),
          meter("Disponibilité (30 j)", tel.uptimePct, " %", tel.uptimePct >= 95),
          meter("Stockage libre", tel.storageFreePct, " %", tel.storageFreePct >= 15),
          meter("Charge CPU", tel.cpuLoadPct, " %", tel.cpuLoadPct < 80),
        ]),
      ]),
    ]),
    el("div", { class: "col-12 col-lg-8" }, [
      el("div", { class: "card h-100" }, [
        el("div", { class: "card-header" }, [el("h3", { class: "card-title m-0" }, ["Fiche de la cabine"]), el("div", { class: "card-actions" }, [editBtn])]),
        el("div", { class: "card-body" }, [
          el("div", { class: "row" }, [
            factRow("Emplacement", booth.location),
            factRow("Adresse postale", booth.address),
            factRow("Type de lieu", booth.venueType ?? ""),
            factRow("Version logicielle", booth.softwareVersion || "en attente du 1er contact"),
            factRow("Dernier contact", heartbeat),
            factRow("Coordonnées GPS", gps),
          ]),
          booth.notes ? el("div", { class: "alert alert-secondary mt-2 mb-0" }, [booth.notes]) : el("span", {}, []),
        ]),
      ]),
    ]),
  ]);
}

function soonTab(label: string): HTMLElement {
  return el("div", { class: "card" }, [
    el("div", { class: "card-body text-center py-5" }, [
      el("div", { class: "text-secondary mb-2" }, [icon("M12 7v5l3 3M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18", 32)]),
      el("h3", { class: "m-0" }, [`« ${label} » par cabine — bientôt`]),
      el("div", { class: "text-secondary mt-1" }, ["Cet onglet du hub arrive dans un prochain incrément de CIN-045."]),
    ]),
  ]);
}

// Page hub d'une cabine. `activeTab` = onglet courant (piloté par App) ; `onTab`
// change d'onglet ; `onBack` retourne à la vue d'ensemble ; `onEdit` ouvre le formulaire.
export function boothHubPage(
  store: FleetStore,
  boothId: string,
  activeTab: BoothTab,
  onTab: (t: BoothTab) => void,
  onBack: () => void,
  onEdit: (b: Booth) => void,
): HTMLElement {
  const booth = store.boothById(boothId);

  const backBtn = el("button", { class: "btn btn-ghost-secondary", type: "button" }, [icon("M15 6l-6 6l6 6", 18), el("span", {}, ["Vue d'ensemble"])]);
  backBtn.addEventListener("click", () => onBack());

  if (!booth) {
    return el("div", {}, [
      el("div", { class: "mb-3" }, [backBtn]),
      el("div", { class: "empty" }, [
        el("p", { class: "empty-title" }, ["Cabine introuvable"]),
        el("p", { class: "empty-subtitle text-secondary" }, ["Elle a peut-être été supprimée."]),
      ]),
    ]);
  }

  // Onglet effectif : si l'onglet demandé est désactivé, retomber sur Infos.
  const current: BoothTab = TABS.find((tb) => tb.id === activeTab && tb.enabled) ? activeTab : "infos";

  const tabBar = el("ul", { class: "nav nav-tabs mb-3" }, TABS.map((tb) => {
    const attrs: Record<string, string> = { class: `nav-link ${tb.id === current ? "active" : ""} ${tb.enabled ? "" : "disabled"}`, href: "#" };
    if (!tb.enabled) { attrs["aria-disabled"] = "true"; attrs["title"] = "Bientôt"; }
    const link = el("a", attrs, [
      el("span", { class: "nav-link-icon d-none d-sm-inline" }, [icon(tb.iconPath, 18)]),
      el("span", {}, [tb.label]),
      ...(tb.enabled ? [] : [el("span", { class: "badge bg-secondary-lt ms-2" }, ["bientôt"])]),
    ]);
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (tb.enabled) onTab(tb.id);
    });
    return el("li", { class: "nav-item" }, [link]);
  }));

  const body =
    current === "revenue"
      ? revenuePage(store, { boothId, embedded: true })
      : current === "sessions"
        ? sessionsPage(store, { boothId, embedded: true })
        : current === "maj"
          ? soonTab("MAJ")
          : current === "media"
            ? soonTab("Médias")
            : current === "access"
              ? soonTab("Accès")
              : infosTab(booth, onEdit);

  return el("div", {}, [
    el("div", { class: "d-flex align-items-center flex-wrap gap-2 mb-2" }, [backBtn]),
    el("div", { class: "d-flex align-items-center flex-wrap gap-2 mb-1" }, [
      el("h2", { class: "page-title m-0 me-2" }, [booth.label]),
      healthBadge(booth.health),
      connectionBadge(booth),
      indicatorChips(booth),
    ]),
    el("div", { class: "text-secondary mb-3" }, [booth.location || "—"]),
    tabBar,
    body,
  ]);
}
