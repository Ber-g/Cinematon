import type { FleetStore } from "../data/store";
import type { Booth } from "../domain/types";
import { el, formatMoney, relativeTime, icon } from "./dom";
import { healthBadge, connectionBadge, indicatorChips } from "./components";
import { timeSeriesChart } from "./chart";
import { openBoothForm } from "./drawer";
import { openAccessModal, accessStatus, OPERATOR_ROLE_LABELS } from "./settings";

// Hub de gestion d'UNE cabine (CIN-045). Réponse au JTBD « tout gérer pour une cabine au
// même endroit » : on garde les vues flotte (globales), et on AJOUTE cette surface par
// cabine. Chaque onglet est scopé à la borne, en réutilisant les données/méthodes du store —
// aucune duplication de la logique métier des vues globales.

export type HubTab = "synthese" | "maj" | "acces" | "fiche";

const DEPLOY_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-secondary-lt" },
  scheduled: { label: "Planifiée", cls: "bg-azure-lt" },
  applying: { label: "En cours", cls: "bg-blue-lt" },
  applied: { label: "Appliquée", cls: "bg-green-lt" },
  failed: { label: "Échec", cls: "bg-red-lt" },
  rolled_back: { label: "Rollback", cls: "bg-red-lt" },
};
const OS_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Demandée", cls: "bg-azure-lt" },
  running: { label: "En cours", cls: "bg-blue-lt" },
  done: { label: "À jour", cls: "bg-green-lt" },
  failed: { label: "Échec", cls: "bg-red-lt" },
};

/**
 * Page hub d'une cabine. `onBack` revient à la vue d'ensemble ; `onChanged` redemande un
 * rendu au parent après une mutation (édition fiche, statut MAJ…).
 */
export function boothHubPage(
  store: FleetStore,
  boothId: string,
  onBack: () => void,
  onChanged: () => void,
  initialTab: HubTab = "synthese",
  onTabChange?: (t: HubTab) => void,
): HTMLElement {
  const booth = store.boothById(boothId);
  if (!booth) {
    return el("div", { class: "text-secondary p-4" }, ["Cabine introuvable.", el("div", {}, [backLink(onBack)])]);
  }
  const canManage = store.canManageOrg(booth.organizationId);
  // L'onglet actif est remonté au parent (`onTabChange`) : il SURVIT aux re-render déclenchés
  // par une mutation (changer la fenêtre de MAJ, déclencher un patch…) qui reconstruit ce hub.
  let tab: HubTab = initialTab;

  const content = el("div", {}, []);
  const renderContent = (): void => {
    const view =
      tab === "maj" ? majTab(store, booth, canManage, onChanged)
      : tab === "acces" ? accesTab(store, booth, canManage)
      : tab === "fiche" ? ficheTab(store, booth, canManage)
      : syntheseTab(booth);
    content.replaceChildren(view);
  };

  const tabBtn = (key: HubTab, label: string): HTMLElement => {
    const b = el("button", { class: `btn ${tab === key ? "btn-primary" : ""}`, type: "button" }, [label]);
    b.addEventListener("click", () => {
      tab = key;
      onTabChange?.(key);
      tabs.querySelectorAll("button").forEach((x) => x.classList.remove("btn-primary"));
      b.classList.add("btn-primary");
      renderContent();
    });
    return b;
  };
  const tabs = el("div", { class: "btn-group", role: "group" }, [
    tabBtn("synthese", "Synthèse"),
    tabBtn("maj", "MAJ"),
    tabBtn("acces", "Accès"),
    tabBtn("fiche", "Fiche & lieu"),
  ]);

  renderContent();

  return el("div", {}, [
    el("div", { class: "mb-3" }, [backLink(onBack)]),
    el("div", { class: "d-flex align-items-center flex-wrap gap-2 mb-1" }, [
      el("h2", { class: "page-title m-0 me-2" }, [booth.label]),
      healthBadge(booth.health),
      connectionBadge(booth),
      indicatorChips(booth),
    ]),
    el("div", { class: "text-secondary mb-3" }, [booth.location || "—"]),
    el("div", { class: "mb-3" }, [tabs]),
    content,
  ]);
}

function backLink(onBack: () => void): HTMLElement {
  const a = el("button", { class: "btn btn-link px-0 text-secondary", type: "button" }, [icon("M15 6l-6 6l6 6", 18), el("span", {}, ["Toutes les cabines"])]);
  a.addEventListener("click", onBack);
  return a;
}

// ── Onglet Synthèse : santé, télémétrie, chiffres du jour, tendance 14 j ──────────
function syntheseTab(booth: Booth): HTMLElement {
  const stat = (label: string, value: string): HTMLElement =>
    el("div", { class: "col" }, [el("div", { class: "text-secondary small" }, [label]), el("div", { class: "fw-bold fs-3" }, [value])]);
  const t = booth.telemetry;
  return el("div", { class: "row row-cards" }, [
    el("div", { class: "col-lg-4" }, [
      el("div", { class: "card" }, [el("div", { class: "card-body" }, [
        el("h3", { class: "card-title" }, ["Aujourd'hui"]),
        el("div", { class: "row g-2" }, [stat("Sessions", String(booth.sessionsToday)), stat("Revenu", formatMoney(booth.revenueTodayCents))]),
        el("div", { class: "row g-2 mt-2" }, [
          stat("Version", booth.softwareVersion || "—"),
          stat("Dernier contact", relativeTime(booth.lastHeartbeatAt)),
        ]),
      ])]),
    ]),
    el("div", { class: "col-lg-4" }, [
      el("div", { class: "card" }, [el("div", { class: "card-body" }, [
        el("h3", { class: "card-title" }, ["Télémétrie"]),
        meter("Disponibilité (30 j)", t.uptimePct, " %", t.uptimePct >= 95),
        meter("Stockage libre", t.storageFreePct, " %", t.storageFreePct >= 15),
        meter("Charge CPU", t.cpuLoadPct, " %", t.cpuLoadPct < 80),
        el("div", { class: "text-secondary small mt-2" }, [`Température ${t.temperatureC} °C · Film : ${t.currentFilmTitle ?? "—"}`]),
      ])]),
    ]),
    el("div", { class: "col-lg-4" }, [
      el("div", { class: "card" }, [el("div", { class: "card-body" }, [
        el("h3", { class: "card-title" }, ["Tendance (14 j)"]),
        timeSeriesChart({ title: "Sessions/jour", points: booth.history.map((d) => ({ date: d.date, value: d.sessions })), kind: "area", hue: "var(--tblr-primary)", formatValue: (n) => String(n) }),
      ])]),
    ]),
  ]);
}

function meter(label: string, value: number, unit: string, ok: boolean): HTMLElement {
  return el("div", { class: "mb-2" }, [
    el("div", { class: "d-flex justify-content-between small text-secondary" }, [el("span", {}, [label]), el("span", {}, [`${value}${unit}`])]),
    el("div", { class: "progress progress-sm" }, [el("div", { class: `progress-bar bg-${ok ? "green" : "yellow"}`, style: `width:${Math.max(0, Math.min(100, value))}%` }, [])]),
  ]);
}

// ── Onglet MAJ : version, fenêtre, dernier déploiement, MAJ OS ───────────────────
function majTab(store: FleetStore, booth: Booth, canManage: boolean, onChanged: () => void): HTMLElement {
  const row = store.updatesReport().rows.find((r) => r.boothId === booth.id);
  const os = store.osUpdateFor(booth.id);
  const wrap = el("div", { class: "row row-cards" }, []);
  const reload = (): void => onChanged();

  // Version + fenêtre de MAJ.
  const hourSel = el("select", { class: "form-select w-auto d-inline-block" }, Array.from({ length: 24 }, (_, h) =>
    el("option", { value: String(h), ...(h === (row?.maintenanceHour ?? 3) ? { selected: "selected" } : {}) }, [`${String(h).padStart(2, "0")}:00`]))) as HTMLSelectElement;
  hourSel.addEventListener("change", () => void store.setMaintenanceHour(booth.id, Number(hourSel.value)).then((r) => (r.ok ? reload() : alert(r.error ?? "Échec."))));

  const versionCard = el("div", { class: "col-lg-6" }, [el("div", { class: "card" }, [el("div", { class: "card-body" }, [
    el("h3", { class: "card-title" }, ["Version logicielle"]),
    el("div", { class: "mb-2" }, [el("span", { class: "badge bg-blue-lt me-2" }, [booth.softwareVersion || "—"]), el("span", { class: "text-secondary small" }, [`contact ${relativeTime(booth.lastHeartbeatAt)}`])]),
    el("div", { class: "form-label" }, ["Fenêtre de mise à jour (heure locale)"]),
    hourSel,
    el("div", { class: "form-hint" }, ["Les MAJ non urgentes s'appliquent dans cette fenêtre."]),
  ])])]);

  // Dernier déploiement.
  const latest = row?.latest;
  const depActions: HTMLElement[] = [];
  if (canManage && latest && ["scheduled", "pending", "applying", "failed"].includes(latest.status)) {
    const b = el("button", { class: "btn btn-sm", type: "button" }, ["Marquer appliquée"]);
    b.addEventListener("click", () => void store.setUpdateStatus(latest.updateId, "applied").then((r) => (r.ok ? reload() : alert(r.error ?? "Échec."))));
    depActions.push(b);
  }
  if (canManage && latest && latest.status === "applied") {
    const b = el("button", { class: "btn btn-sm btn-outline-danger", type: "button" }, ["Rollback"]);
    b.addEventListener("click", () => void store.setUpdateStatus(latest.updateId, "rolled_back").then((r) => (r.ok ? reload() : alert(r.error ?? "Échec."))));
    depActions.push(b);
  }
  const deployCard = el("div", { class: "col-lg-6" }, [el("div", { class: "card" }, [el("div", { class: "card-body" }, [
    el("h3", { class: "card-title" }, ["Dernier déploiement"]),
    latest
      ? el("div", { class: "d-flex align-items-center gap-2 mb-2" }, [el("span", { class: "text-secondary" }, [latest.version]), el("span", { class: `badge ${DEPLOY_STATUS[latest.status]?.cls ?? "bg-secondary-lt"}` }, [DEPLOY_STATUS[latest.status]?.label ?? latest.status])])
      : el("div", { class: "text-secondary" }, ["Aucun déploiement. Déployez une version depuis Maintenance."]),
    el("div", { class: "btn-list" }, depActions),
  ])])]);

  // MAJ OS.
  const osBusy = os?.status === "pending" || os?.status === "running";
  const osActions: HTMLElement[] = [];
  if (store.isGlobalAdmin && !osBusy) {
    const b = el("button", { class: "btn btn-sm", type: "button", title: "Demander une MAJ système (apt) à cette borne" }, ["Mettre à jour l'OS"]);
    b.addEventListener("click", () => void store.requestOsUpdate([booth.id]).then((r) => (r.ok ? reload() : alert(r.error ?? "Échec."))));
    osActions.push(b);
  }
  const osCard = el("div", { class: "col-12" }, [el("div", { class: "card" }, [el("div", { class: "card-body" }, [
    el("h3", { class: "card-title" }, ["Système d'exploitation"]),
    os
      ? el("div", { class: "d-flex align-items-center gap-2 mb-2" }, [
          el("span", { class: `badge ${OS_STATUS[os.status]?.cls ?? "bg-secondary-lt"}`, ...(os.error ? { title: os.error } : {}) }, [OS_STATUS[os.status]?.label ?? os.status]),
          os.packagesPending ? el("span", { class: "text-secondary small" }, [`${os.packagesPending} paquet(s) en attente`]) : el("span", {}, []),
        ])
      : el("div", { class: "text-secondary mb-2" }, ["Aucune commande de MAJ OS."]),
    store.isGlobalAdmin
      ? el("div", { class: "btn-list" }, osActions.length ? osActions : [el("span", { class: "text-secondary small" }, ["MAJ OS en cours…"])])
      : el("div", { class: "text-secondary small" }, ["Les MAJ système sont pilotées par Kioskoscope."]),
  ])])]);

  wrap.replaceChildren(versionCard, deployCard, osCard);
  return wrap;
}

// ── Onglet Accès : PINs opérateur scopés à cette cabine (+ portée « toutes ») ─────
function accesTab(store: FleetStore, booth: Booth, canManage: boolean): HTMLElement {
  const org = store.organizations().find((o) => o.id === booth.organizationId) ?? null;
  const wrap = el("div", {}, [el("div", { class: "card" }, [el("div", { class: "card-body text-secondary" }, ["Chargement des accès…"])])]);
  if (!org) return wrap;

  const orgBooths = store.visibleBooths().filter((b) => b.organizationId === org.id);

  const load = (): void => {
    void store.listOperatorAccess(org.id).then((all) => {
      // Accès qui s'appliquent à CETTE cabine : ceux scopés dessus + ceux « toutes les Kiosks ».
      const list = all.filter((a) => a.boothId === booth.id || a.boothId === null);
      const rows = list.map((a) => {
        const st = accessStatus(a);
        const actions: HTMLElement[] = [];
        if (canManage) {
          const toggle = el("button", { class: `btn btn-sm ${a.revoked ? "btn-outline-success" : "btn-outline-danger"}`, type: "button" }, [a.revoked ? "Réactiver" : "Révoquer"]);
          toggle.addEventListener("click", () => void store.setOperatorAccessRevoked(a.id, !a.revoked).then((r) => (r.ok ? load() : alert(r.error ?? "Échec."))));
          actions.push(toggle);
        }
        return el("tr", {}, [
          el("td", {}, [el("div", { class: "fw-bold" }, [a.identifier]), a.label ? el("div", { class: "text-secondary small" }, [a.label]) : el("span", {}, [])]),
          el("td", {}, [el("span", { class: "badge bg-secondary-lt" }, [OPERATOR_ROLE_LABELS[a.role]])]),
          el("td", {}, [a.boothId === null ? el("span", { class: "badge bg-azure-lt" }, ["Toutes les cabines"]) : el("span", { class: "text-secondary small" }, ["Cette cabine"])]),
          el("td", {}, [el("span", { class: `badge ${st.cls}` }, [st.label])]),
          el("td", { class: "text-end" }, actions),
        ]);
      });

      const children: HTMLElement[] = [];
      if (canManage) {
        const add = el("button", { class: "btn btn-primary mb-3", type: "button" }, ["Créer un accès pour cette cabine"]);
        add.addEventListener("click", () => openAccessModal(store, org, orgBooths, all.map((a) => a.identifier), load, booth.id));
        children.push(add);
      }
      children.push(el("div", { class: "card" }, [el("div", { class: "table-responsive" }, [
        el("table", { class: "table table-vcenter card-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Identifiant"]), el("th", {}, ["Rôle"]), el("th", {}, ["Portée"]), el("th", {}, ["Statut"]), el("th", {}, [])])]),
          el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: "5", class: "text-secondary text-center py-4" }, ["Aucun accès pour cette cabine."])])]),
        ]),
      ])]));
      wrap.replaceChildren(...children);
    });
  };
  load();
  return wrap;
}

// ── Onglet Fiche & lieu : infos d'implantation + édition complète ────────────────
// L'édition passe par `openBoothForm` → `store.upsertBooth` émet → le parent re-render.
function ficheTab(store: FleetStore, booth: Booth, canManage: boolean): HTMLElement {
  const line = (label: string, value: string): HTMLElement =>
    el("div", { class: "mb-2" }, [el("div", { class: "text-secondary small" }, [label]), el("div", {}, [value || "—"])]);
  const gps = booth.gpsLat != null && booth.gpsLng != null ? `${booth.gpsLat.toFixed(5)}, ${booth.gpsLng.toFixed(5)}` : "";

  const editBtn = el("button", { class: "btn btn-primary", type: "button" }, [icon("M4 20h4l10 -10l-4 -4l-10 10v4", 18), el("span", {}, ["Modifier la fiche"])]);
  editBtn.addEventListener("click", () => openBoothForm(store, booth));

  return el("div", { class: "card" }, [el("div", { class: "card-body" }, [
    el("div", { class: "d-flex align-items-center mb-3" }, [el("h3", { class: "card-title m-0" }, ["Implantation"]), canManage ? el("div", { class: "ms-auto" }, [editBtn]) : el("span", {}, [])]),
    line("Emplacement", booth.location),
    line("Adresse postale", booth.address),
    line("Catégorie de lieu", booth.venueType ?? ""),
    line("Coordonnées GPS", gps),
    line("Notes d'accès", booth.notes),
    canManage ? el("span", {}, []) : el("div", { class: "text-secondary small mt-2" }, ["Modification réservée aux administrateurs de l'organisation."]),
  ])]);
}
