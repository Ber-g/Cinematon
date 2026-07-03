import { GridStack } from "gridstack";
import type { GridStackNode } from "gridstack";
import type { Booth, Role } from "../domain/types";
import type { FleetStore } from "../data/store";
import { el, icon } from "./dom";
import { boothCard, boothTable, computeKpis, kpiTile, statusDistribution } from "./components";
import { openBoothDrawer, openBoothForm } from "./drawer";

const THEME_KEY = "cinematon.admin.theme.v1";

// Contrôleur du back-office : rend le shell Tabler + la vue d'ensemble, gère le
// rôle, le thème clair/sombre et le mode « édition de la disposition » (Gridstack).
export class App {
  private grid: GridStack | undefined;
  private editing = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: FleetStore,
  ) {
    this.store.subscribe(() => this.render());
    this.applyStoredTheme();
  }

  render(): void {
    const booths = this.store.visibleBooths();
    this.root.replaceChildren(
      this.sidebar(),
      this.topbar(),
      el("div", { class: "page-wrapper" }, [
        el("div", { class: "page-body" }, [el("div", { class: "container-xl" }, [this.overview(booths)])]),
      ]),
    );
    this.mountGrid();
  }

  // ── Barre latérale ────────────────────────────────────────────────────────
  private sidebar(): HTMLElement {
    return el("aside", { class: "navbar navbar-vertical navbar-expand-lg", "data-bs-theme": "dark" }, [
      el("div", { class: "container-fluid" }, [
        el("h1", { class: "navbar-brand fs-2 fw-bold m-0" }, ["CINEMATON"]),
        el("div", { class: "navbar-nav flex-column mt-3 w-100" }, [
          navItem("Vue d'ensemble", "M4 21v-13l8 -4l8 4v13M9 21v-6h6v6", true),
          navItem("Cabines", "M4 21v-13l8 -4l8 4v13", false),
          navItem("Sessions", "M8 4v16M16 4v16M4 8h16M4 16h16", false),
          navItem("Réglages", "M12 15a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z", false),
        ]),
      ]),
    ]);
  }

  // ── Barre du haut : rôle, thème, édition, ajout ───────────────────────────
  private topbar(): HTMLElement {
    const user = this.store.currentUser;

    const roleBtn = el("button", { class: "btn dropdown-toggle", type: "button", "data-bs-toggle": "dropdown" }, [
      icon("M12 12a4 4 0 1 0 0 -8a4 4 0 0 0 0 8zM6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2", 18),
      el("span", {}, [user.name]),
    ]);
    const roleMenu = el("div", { class: "dropdown-menu dropdown-menu-end" }, [
      roleOption("Opérateur (tous les outils)", "operator", user.role, (r) => this.store.setRole(r)),
      roleOption("Gérant de bar (sans debug)", "bar_manager", user.role, (r) => this.store.setRole(r)),
    ]);

    const themeBtn = el("button", { class: "btn btn-icon", type: "button", title: "Basculer clair/sombre" }, [
      icon("M12 3a6 6 0 0 0 0 12a6 6 0 0 0 0 -12zM12 3v0M12 21v-3M3 12h3M18 12h3", 18),
    ]);
    themeBtn.addEventListener("click", () => this.toggleTheme());

    const editBtn = el(
      "button",
      { class: `btn ${this.editing ? "btn-primary" : ""}`, type: "button" },
      [icon("M4 20h4l10 -10l-4 -4l-10 10v4", 18), el("span", {}, [this.editing ? "Terminer" : "Éditer la disposition"])],
    );
    editBtn.addEventListener("click", () => this.toggleEditing());

    const addBtn = el("button", { class: "btn btn-primary", type: "button" }, [
      icon("M12 5v14M5 12h14", 18),
      el("span", {}, ["Ajouter une cabine"]),
    ]);
    addBtn.addEventListener("click", () => openBoothForm(this.store, null));

    return el("header", { class: "navbar navbar-expand-md d-print-none" }, [
      el("div", { class: "container-xl" }, [
        el("div", { class: "navbar-nav flex-row order-md-last ms-auto align-items-center gap-2" }, [
          editBtn,
          themeBtn,
          el("div", { class: "nav-item dropdown" }, [roleBtn, roleMenu]),
          addBtn,
        ]),
      ]),
    ]);
  }

  // ── Vue d'ensemble ────────────────────────────────────────────────────────
  private overview(booths: readonly Booth[]): HTMLElement {
    const kpis = computeKpis(booths);

    // Rangée de KPI = zone Gridstack (widgets déplaçables/redimensionnables).
    const gridItems = kpis.map((k, i) =>
      el("div", { class: "grid-stack-item", "gs-id": `kpi-${i}`, "gs-w": "2", "gs-h": "2", "gs-x": String((i * 2) % 12), "gs-y": "0" }, [
        el("div", { class: "grid-stack-item-content" }, [kpiTile(k)]),
      ]),
    );
    const gridEl = el("div", { class: "grid-stack" }, gridItems);

    const cards = booths.map((b) => el("div", { class: "col-sm-6 col-lg-4" }, [boothCard(b, (id) => this.openDrawer(id))]));

    const header = el("div", { class: "d-flex align-items-center justify-content-between mb-3" }, [
      el("div", {}, [
        el("h2", { class: "page-title m-0" }, ["Vue d'ensemble de la flotte"]),
        el("div", { class: "text-secondary" }, [
          this.store.isOperator ? "Toutes vos cabines." : "Vos cabines.",
          this.editing ? " · Glissez les tuiles pour réorganiser." : "",
        ]),
      ]),
    ]);

    return el("div", {}, [
      header,
      gridEl,
      el("div", { class: "row row-cards mt-1" }, [
        el("div", { class: "col-lg-4" }, [statusDistribution(booths)]),
        el("div", { class: "col-lg-8" }, [el("div", { class: "row row-cards" }, cards)]),
      ]),
      el("div", { class: "mt-3" }, [boothTable(booths, (id) => this.openDrawer(id))]),
    ]);
  }

  private openDrawer(id: string): void {
    openBoothDrawer(this.store, id, (b) => openBoothForm(this.store, b));
  }

  // ── Gridstack : montage + persistance ─────────────────────────────────────
  private mountGrid(): void {
    const gridEl = this.root.querySelector<HTMLElement>(".grid-stack");
    if (!gridEl) return;

    this.applySavedLayout(gridEl);
    this.grid = GridStack.init(
      { column: 12, cellHeight: 64, margin: 8, staticGrid: !this.editing, float: true },
      gridEl,
    );
    this.grid.on("change", () => this.persistLayout());
  }

  private applySavedLayout(gridEl: HTMLElement): void {
    const saved = this.store.loadLayout();
    if (!Array.isArray(saved)) return;
    const byId = new Map<string, GridStackNode>();
    for (const n of saved as GridStackNode[]) if (n.id) byId.set(String(n.id), n);
    for (const item of Array.from(gridEl.querySelectorAll<HTMLElement>(".grid-stack-item"))) {
      const id = item.getAttribute("gs-id");
      const n = id ? byId.get(id) : undefined;
      if (!n) continue;
      if (n.x !== undefined) item.setAttribute("gs-x", String(n.x));
      if (n.y !== undefined) item.setAttribute("gs-y", String(n.y));
      if (n.w !== undefined) item.setAttribute("gs-w", String(n.w));
      if (n.h !== undefined) item.setAttribute("gs-h", String(n.h));
    }
  }

  private persistLayout(): void {
    if (!this.grid) return;
    this.store.saveLayout(this.grid.save(false));
  }

  private toggleEditing(): void {
    this.editing = !this.editing;
    this.render();
  }

  // ── Thème clair/sombre ────────────────────────────────────────────────────
  private applyStoredTheme(): void {
    const theme = localStorage.getItem(THEME_KEY) ?? "dark";
    document.documentElement.setAttribute("data-bs-theme", theme);
  }
  private toggleTheme(): void {
    const next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }
}

// ── Petits helpers de navigation ────────────────────────────────────────────
function navItem(label: string, path: string, active: boolean): HTMLElement {
  return el("div", { class: "nav-item" }, [
    el("a", { class: `nav-link ${active ? "active" : ""}`, href: "#" }, [
      el("span", { class: "nav-link-icon" }, [icon(path, 20)]),
      el("span", { class: "nav-link-title" }, [label]),
    ]),
  ]);
}

function roleOption(label: string, role: Role, current: Role, onPick: (r: Role) => void): HTMLElement {
  const a = el("button", { class: `dropdown-item ${role === current ? "active" : ""}`, type: "button" }, [label]);
  a.addEventListener("click", () => onPick(role));
  return a;
}
