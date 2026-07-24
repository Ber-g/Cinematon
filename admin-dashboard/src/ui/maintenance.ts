import { Modal } from "bootstrap";
import type { FleetStore, Release, UpdatesReport } from "../data/store";
import { el, relativeTime } from "./dom";
import { t } from "../i18n";
import { boothLabelEl } from "./components";

// Menu Maintenance (Phase 4 / F10) : versions logicielles (releases), déploiement vers
// des Kiosks, état par Kiosk (version courante, dernier contact, fenêtre de MAJ,
// dernier déploiement + rollback). L'updater embarqué (appliquer/rollback réel) est différé —
// ici on gère le déploiement + un pilotage manuel du statut (ops), et les alertes de rollback.

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-secondary-lt" },
  scheduled: { label: "Planifiée", cls: "bg-azure-lt" },
  applying: { label: "En cours", cls: "bg-blue-lt" },
  applied: { label: "Appliquée", cls: "bg-green-lt" },
  failed: { label: "Échec", cls: "bg-red-lt" },
  rolled_back: { label: "Rollback", cls: "bg-red-lt" },
};

// MAJ OS (CIN-077) : statut de la commande relayée à l'agent local de la borne.
const OS_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Demandée", cls: "bg-azure-lt" },
  running: { label: "En cours", cls: "bg-blue-lt" },
  done: { label: "À jour", cls: "bg-green-lt" },
  failed: { label: "Échec", cls: "bg-red-lt" },
};

export function maintenancePage(store: FleetStore, onChanged: () => void, onOpenBooth?: (id: string) => void): HTMLElement {
  const container = el("div", {}, [el("div", { class: "text-secondary p-3" }, ["Chargement…"])]);
  const reload = (): void => container.replaceChildren(render(store, store.updatesReport(), () => { onChanged(); reload(); }, onOpenBooth));
  reload();
  return container;
}

function render(store: FleetStore, rep: UpdatesReport, reload: () => void, onOpenBooth?: (id: string) => void): HTMLElement {
  const orgId = store.current?.activeOrganizationId ?? store.organizations()[0]?.id ?? "";

  // ── Versions (releases) ──
  const relRows = rep.releases.map((r) => {
    const deploy = el("button", { class: "btn btn-sm", type: "button" }, ["Déployer"]);
    deploy.addEventListener("click", () => openDeployModal(store, orgId, r, reload));
    return el("tr", {}, [
      el("td", { class: "fw-bold" }, [r.version]),
      el("td", {}, [el("span", { class: `badge ${r.urgency === "urgent" ? "bg-red-lt" : "bg-secondary-lt"}` }, [r.urgency === "urgent" ? "Urgente" : "Normale"])]),
      el("td", { class: "text-secondary" }, [r.notes || "—"]),
      el("td", { class: "text-secondary text-nowrap" }, [new Date(r.createdAt).toLocaleDateString("fr-FR")]),
      el("td", { class: "text-end" }, [deploy]),
    ]);
  });
  // CIN-016 : fabriquer une version est réservé à la plateforme (global_admin) ; un client
  // DÉPLOIE une version existante mais ne la crée pas (aligné sur la RLS releases, 0016).
  const newRel = store.isGlobalAdmin
    ? el("button", { class: "btn btn-primary", type: "button" }, ["Nouvelle version"])
    : el("span", { class: "text-secondary small" }, ["Les versions sont publiées par Kioskoscope."]);
  if (store.isGlobalAdmin) newRel.addEventListener("click", () => openReleaseModal(store, orgId, reload));

  // ── État par Kiosk ──
  const boothRows = rep.rows.map((row) => {
    const hourSel = el("select", { class: "form-select form-select-sm w-auto" }, Array.from({ length: 24 }, (_, h) => el("option", { value: String(h), ...(h === row.maintenanceHour ? { selected: "selected" } : {}) }, [`${String(h).padStart(2, "0")}:00`]))) as HTMLSelectElement;
    hourSel.addEventListener("change", () => void store.setMaintenanceHour(row.boothId, Number(hourSel.value)).then((res) => (res.ok ? reload() : alert(res.error ?? "Échec."))));

    const latest = row.latest;
    const latestCell = latest
      ? el("span", { class: "d-inline-flex align-items-center gap-1" }, [
          el("span", { class: "text-secondary" }, [latest.version]),
          el("span", { class: `badge ${STATUS[latest.status].cls}` }, [STATUS[latest.status].label]),
          latest.urgency === "urgent" ? el("span", { class: "badge bg-red-lt" }, ["urgente"]) : el("span", {}, []),
        ])
      : el("span", { class: "text-secondary" }, ["—"]);

    // Actions ops (en attendant l'updater embarqué) : marquer appliquée / rollback.
    const actions: HTMLElement[] = [];
    if (latest && (latest.status === "scheduled" || latest.status === "pending" || latest.status === "applying" || latest.status === "failed")) {
      const apply = el("button", { class: "btn btn-sm", type: "button", title: "Marquer comme appliquée (ops)" }, ["Appliquée"]);
      apply.addEventListener("click", () => void store.setUpdateStatus(latest.updateId, "applied").then((res) => (res.ok ? reload() : alert(res.error ?? "Échec."))));
      actions.push(apply);
    }
    if (latest && latest.status === "applied") {
      const rb = el("button", { class: "btn btn-sm btn-outline-danger", type: "button", title: "Rollback + alerte" }, ["Rollback"]);
      rb.addEventListener("click", () => void store.setUpdateStatus(latest.updateId, "rolled_back").then((res) => (res.ok ? reload() : alert(res.error ?? "Échec."))));
      actions.push(rb);
    }

    // ── MAJ OS (CIN-077) : état de la dernière commande + déclencheur (global_admin) ──
    const osCmd = store.osUpdateFor(row.boothId);
    const osCell = osCmd
      ? el("span", { class: "d-inline-flex align-items-center gap-1" }, [
          el("span", { class: `badge ${OS_STATUS[osCmd.status]?.cls ?? "bg-secondary-lt"}`, ...(osCmd.error ? { title: osCmd.error } : {}) }, [OS_STATUS[osCmd.status]?.label ?? osCmd.status]),
          osCmd.status === "done" && osCmd.packagesPending === 0 ? el("span", {}, []) : (osCmd.packagesPending ? el("span", { class: "text-secondary small" }, [`${osCmd.packagesPending} paquet${osCmd.packagesPending > 1 ? "s" : ""}`]) : el("span", {}, [])),
        ])
      : el("span", { class: "text-secondary" }, ["—"]);
    const osBusy = osCmd?.status === "pending" || osCmd?.status === "running";
    if (store.isGlobalAdmin && !osBusy) {
      const osBtn = el("button", { class: "btn btn-sm", type: "button", title: "Demander une MAJ système (apt) à cette borne" }, ["MAJ OS"]);
      osBtn.addEventListener("click", () => void store.requestOsUpdate([row.boothId]).then((res) => (res.ok ? reload() : alert(res.error ?? "Échec."))));
      actions.push(osBtn);
    }

    return el("tr", {}, [
      el("td", { class: "fw-bold" }, [boothLabelEl(row.boothLabel, onOpenBooth ? () => onOpenBooth(row.boothId) : undefined)]),
      el("td", {}, [el("span", { class: "badge bg-blue-lt" }, [row.currentVersion])]),
      el("td", { class: "text-secondary text-nowrap" }, [relativeTime(row.lastHeartbeat)]),
      el("td", {}, [hourSel]),
      el("td", {}, [latestCell]),
      el("td", {}, [osCell]),
      el("td", { class: "text-end" }, [el("span", { class: "btn-list justify-content-end" }, actions)]),
    ]);
  });

  // Déclencheur MAJ OS sur tout le parc visible (réservé plateforme).
  const osFleet = store.isGlobalAdmin
    ? el("button", { class: "btn btn-sm", type: "button" }, ["Mettre à jour l'OS du parc"])
    : el("span", {}, []);
  if (store.isGlobalAdmin) {
    osFleet.addEventListener("click", () => {
      const ids = rep.rows.map((r) => r.boothId);
      if (ids.length === 0) return;
      void store.requestOsUpdate(ids).then((res) => (res.ok ? reload() : alert(res.error ?? "Échec.")));
    });
  }

  return el("div", {}, [
    el("div", { class: "mb-3" }, [
      el("h2", { class: "page-title m-0" }, [t("page.maintenance")]),
      el("div", { class: "text-secondary" }, ["Déploiement des versions, fenêtres de MAJ et rollback. L'application réelle côté borne (updater + watchdog) suivra ; ici on planifie et on suit l'état."]),
    ]),
    el("div", { class: "card mb-3" }, [
      el("div", { class: "card-header d-flex align-items-center" }, [el("h3", { class: "card-title m-0" }, ["Versions logicielles"]), el("div", { class: "ms-auto" }, [newRel])]),
      el("div", { class: "table-responsive" }, [
        el("table", { class: "table table-vcenter card-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Version"]), el("th", {}, ["Urgence"]), el("th", {}, ["Notes"]), el("th", {}, ["Créée"]), el("th", {}, [])])]),
          el("tbody", {}, relRows.length ? relRows : [el("tr", {}, [el("td", { colspan: "5", class: "text-secondary text-center py-3" }, ["Aucune version. Créez-en une pour la déployer."])])]),
        ]),
      ]),
    ]),
    el("div", { class: "card" }, [
      el("div", { class: "card-header d-flex align-items-center" }, [el("h3", { class: "card-title m-0" }, ["État des Kiosks"]), el("div", { class: "ms-auto" }, [osFleet])]),
      el("div", { class: "table-responsive" }, [
        el("table", { class: "table table-vcenter card-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Kiosk"]), el("th", {}, ["Version"]), el("th", {}, ["Dernier contact"]), el("th", {}, ["Fenêtre MAJ"]), el("th", {}, ["Dernier déploiement"]), el("th", {}, ["MAJ OS"]), el("th", {}, [])])]),
          el("tbody", {}, boothRows.length ? boothRows : [el("tr", {}, [el("td", { colspan: "7", class: "text-secondary text-center py-3" }, ["Aucun Kiosk."])])]),
        ]),
      ]),
    ]),
  ]);
}

function openReleaseModal(store: FleetStore, orgId: string, onDone: () => void): void {
  const version = el("input", { class: "form-control", type: "text", placeholder: "0.4.0" }) as HTMLInputElement;
  const urgency = el("select", { class: "form-select" }, [el("option", { value: "normal" }, ["Normale (fenêtre de MAJ)"]), el("option", { value: "urgent" }, ["Urgente (dès que possible)"])]) as HTMLSelectElement;
  const notes = el("textarea", { class: "form-control", rows: "2", placeholder: "Notes de version…" }) as HTMLTextAreaElement;
  const error = el("div", { class: "alert alert-danger d-none" }, []);
  const save = el("button", { class: "btn btn-primary ms-auto", type: "button" }, ["Créer"]);
  save.addEventListener("click", () => {
    if (!version.value.trim()) return;
    save.setAttribute("disabled", "true");
    void store.saveRelease(orgId, { version: version.value.trim(), urgency: urgency.value, notes: notes.value.trim() }).then((res) => {
      if (res.ok) { modal.hide(); onDone(); }
      else { save.removeAttribute("disabled"); error.textContent = res.error ?? "Échec."; error.classList.remove("d-none"); }
    });
  });
  const field = (l: string, i: HTMLElement): HTMLElement => el("div", { class: "mb-3" }, [el("label", { class: "form-label" }, [l]), i]);
  const modal = buildModal("Nouvelle version", [error, field("Version", version), field("Urgence", urgency), field("Notes", notes)], save);
}

function openDeployModal(store: FleetStore, orgId: string, release: Release, onDone: () => void): void {
  const booths = store.visibleBooths();
  const checks = new Map<string, HTMLInputElement>();
  const list = el("div", { class: "list-group" }, booths.map((b) => {
    const cb = el("input", { class: "form-check-input", type: "checkbox", id: `dep-${b.id}` }) as HTMLInputElement;
    checks.set(b.id, cb);
    return el("label", { class: "list-group-item d-flex align-items-center gap-2", for: `dep-${b.id}` }, [cb, el("span", { class: "flex-fill" }, [b.label]), el("span", { class: "text-secondary small" }, [b.softwareVersion || "—"])]);
  }));
  const error = el("div", { class: "alert alert-danger d-none" }, []);
  const deploy = el("button", { class: "btn btn-primary ms-auto", type: "button" }, ["Déployer"]);
  deploy.addEventListener("click", () => {
    const boothIds = [...checks.entries()].filter(([, cb]) => cb.checked).map(([id]) => id);
    if (boothIds.length === 0) { error.textContent = "Sélectionnez au moins un Kiosk."; error.classList.remove("d-none"); return; }
    deploy.setAttribute("disabled", "true");
    void store.pushRelease(orgId, release.id, boothIds).then((res) => {
      if (res.ok) { modal.hide(); onDone(); }
      else { deploy.removeAttribute("disabled"); error.textContent = res.error ?? "Échec."; error.classList.remove("d-none"); }
    });
  });
  const modal = buildModal(`Déployer ${release.version}${release.urgency === "urgent" ? " (urgente)" : ""}`, [error, el("div", { class: "text-secondary mb-2" }, ["Cibler les Kiosks :"]), booths.length ? list : el("div", { class: "text-secondary" }, ["Aucun Kiosk."])], deploy);
}

function buildModal(titleText: string, body: Node[], footerBtn: HTMLElement): Modal {
  const modalEl = el("div", { class: "modal modal-blur fade", tabindex: "-1" }, [
    el("div", { class: "modal-dialog modal-dialog-centered" }, [
      el("div", { class: "modal-content" }, [
        el("div", { class: "modal-header" }, [el("h3", { class: "modal-title" }, [titleText]), el("button", { class: "btn-close", type: "button", "data-bs-dismiss": "modal" }, [])]),
        el("div", { class: "modal-body" }, body),
        el("div", { class: "modal-footer" }, [el("button", { class: "btn", type: "button", "data-bs-dismiss": "modal" }, ["Annuler"]), footerBtn]),
      ]),
    ]),
  ]);
  document.body.append(modalEl);
  const modal = new Modal(modalEl);
  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove(), { once: true });
  modal.show();
  return modal;
}
