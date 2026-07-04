import { GridStack } from "gridstack";
import type { GridStackNode } from "gridstack";
import type { Booth, HealthStatus, Role } from "../domain/types";
import type { FleetStore } from "../data/store";
import { el, icon } from "./dom";
import type { Kpi, SortKey, SortState } from "./components";
import { boothCard, boothTable, computeKpis, kpiTile, sortBooths, statusDistribution } from "./components";
import { openBoothDrawer, openBoothForm } from "./drawer";

const THEME_KEY = "cinematon.admin.theme.v1";

interface FilterState {
  readonly statuses: readonly HealthStatus[];
  readonly label: string;
  readonly color: string;
}

// Contrôleur du back-office : shell Tabler + vue d'ensemble. Gère rôle, thème,
// mode « édition de la disposition » (Gridstack), FILTRE au clic et TRI du tableau.
export class App {
  private grid: GridStack | undefined;
  private editing = false;
  private filter: FilterState | null = null;
  private sort: SortState = { key: "health", dir: "asc" };

  constructor(
    private readonly root: HTMLElement,
    private readonly store: FleetStore,
  ) {
    this.store.subscribe(() => this.render());
    this.applyStoredTheme();
  }

  render(): void {
    this.root.replaceChildren(
      this.sidebar(),
      this.topbar(),
      el("div", { class: "page-wrapper" }, [
        el("div", { class: `page-body ${this.filter ? `is-filtered filtered-${this.filter.color}` : ""}` }, [
          el("div", { class: "container-xl" }, [this.overview()]),
        ]),
      ]),
    );
    this.mountGrid();
  }

  /** Cabines visibles → filtrées → triées. */
  private currentBooths(): Booth[] {
    let list = this.store.visibleBooths();
    if (this.filter && this.filter.statuses.length > 0) {
      list = list.filter((b) => this.filter!.statuses.includes(b.health));
    }
    return sortBooths(list, this.sort);
  }

  // ── Barre latérale (responsive : toggler + collapse) ──────────────────────
  private sidebar(): HTMLElement {
    return el("aside", { class: "navbar navbar-vertical navbar-expand-lg", "data-bs-theme": "dark" }, [
      el("div", { class: "container-fluid" }, [
        el("button", { class: "navbar-toggler", type: "button", "data-bs-toggle": "collapse", "data-bs-target": "#sidebar-menu", "aria-label": "Menu" }, [
          el("span", { class: "navbar-toggler-icon" }, []),
        ]),
        el("h1", { class: "navbar-brand fs-2 fw-bold m-0" }, ["CINEMATON"]),
        el("div", { class: "collapse navbar-collapse", id: "sidebar-menu" }, [
          el("ul", { class: "navbar-nav pt-lg-2 w-100" }, [
            navItem("Vue d'ensemble", "M4 21v-13l8 -4l8 4v13M9 21v-6h6v6", true),
            navItem("Cabines", "M4 21v-13l8 -4l8 4v13", false),
            navItem("Sessions", "M8 4v16M16 4v16M4 8h16M4 16h16", false),
            navItem("Réglages", "M12 15a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z", false),
          ]),
        ]),
      ]),
    ]);
  }

  // ── Barre du haut ─────────────────────────────────────────────────────────
  private topbar(): HTMLElement {
    const user = this.store.currentUser;

    const roleBtn = el("button", { class: "btn dropdown-toggle", type: "button", "data-bs-toggle": "dropdown" }, [
      icon("M12 12a4 4 0 1 0 0 -8a4 4 0 0 0 0 8zM6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2", 18),
      el("span", { class: "d-none d-sm-inline" }, [user.name]),
    ]);
    const roleMenu = el("div", { class: "dropdown-menu dropdown-menu-end" }, [
      roleOption("Opérateur (tous les outils)", "operator", user.role, (r) => this.store.setRole(r)),
      roleOption("Gérant de bar (sans debug)", "bar_manager", user.role, (r) => this.store.setRole(r)),
    ]);

    const themeBtn = el("button", { class: "btn btn-icon", type: "button", title: "Basculer clair/sombre" }, [
      icon("M12 3a6 6 0 0 0 0 12a6 6 0 0 0 0 -12zM12 3v0M12 21v-3M3 12h3M18 12h3", 18),
    ]);
    themeBtn.addEventListener("click", () => this.toggleTheme());

    const editBtn = el("button", { class: `btn ${this.editing ? "btn-primary" : ""}`, type: "button" }, [
      icon("M4 20h4l10 -10l-4 -4l-10 10v4", 18),
      el("span", { class: "d-none d-md-inline" }, [this.editing ? "Terminer" : "Éditer"]),
    ]);
    editBtn.addEventListener("click", () => this.toggleEditing());

    const addBtn = el("button", { class: "btn btn-primary", type: "button" }, [
      icon("M12 5v14M5 12h14", 18),
      el("span", { class: "d-none d-sm-inline" }, ["Ajouter"]),
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
  private overview(): HTMLElement {
    const all = this.store.visibleBooths();
    const kpis = computeKpis(all);
    const booths = this.currentBooths();

    const gridItems = kpis.map((k, i) =>
      el("div", { class: "grid-stack-item", "gs-id": `kpi-${i}`, "gs-w": "1", "gs-h": "1", "gs-x": String(i % 6), "gs-y": "0" }, [
        el("div", { class: "grid-stack-item-content" }, [
          kpiTile(k, this.isKpiActive(k), k.filter !== undefined && !this.editing, () => this.applyFilter(k)),
        ]),
      ]),
    );

    const cards = booths.map((b) => el("div", { class: "col-sm-6 col-xl-4" }, [boothCard(b, (id) => this.openDrawer(id))]));

    return el("div", {}, [
      el("div", { class: "mb-3" }, [
        el("h2", { class: "page-title m-0" }, ["Vue d'ensemble de la flotte"]),
        el("div", { class: "text-secondary" }, [
          this.store.isOperator ? "Toutes vos cabines." : "Vos cabines.",
          this.editing ? " · Glissez les tuiles pour réorganiser." : "",
        ]),
      ]),
      el("div", { class: "grid-stack" }, gridItems),
      this.filterBanner(),
      el("div", { class: "row row-cards mt-1" }, [
        el("div", { class: "col-xl-4" }, [statusDistribution(all)]),
        el("div", { class: "col-xl-8" }, [el("div", { class: "row row-cards" }, cards)]),
      ]),
      el("div", { class: "mt-3" }, [boothTable(booths, this.sort, (k) => this.applySort(k), (id) => this.openDrawer(id))]),
    ]);
  }

  private filterBanner(): HTMLElement {
    if (!this.filter) return el("span", {}, []);
    const clear = el("button", { class: "btn btn-sm ms-auto", type: "button" }, ["Effacer le filtre"]);
    clear.addEventListener("click", () => {
      this.filter = null;
      this.render();
    });
    return el("div", { class: `alert alert-${this.filter.color} d-flex align-items-center mt-3 mb-0` }, [
      el("span", {}, [`Vue filtrée : ${this.filter.label}`]),
      clear,
    ]);
  }

  private isKpiActive(kpi: Kpi): boolean {
    if (!this.filter || !kpi.filter || kpi.filter.length === 0) return false;
    return kpi.filter.length === this.filter.statuses.length && kpi.filter.every((s) => this.filter!.statuses.includes(s));
  }

  private applyFilter(kpi: Kpi): void {
    if (!kpi.filter) return;
    if (kpi.filter.length === 0 || this.isKpiActive(kpi)) {
      this.filter = null; // "Cabines" ou re-clic sur le filtre actif = tout afficher
    } else {
      this.filter = { statuses: kpi.filter, label: kpi.label, color: kpi.color };
    }
    this.render();
  }

  private applySort(key: SortKey): void {
    this.sort = this.sort.key === key ? { key, dir: this.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
    this.render();
  }

  private openDrawer(id: string): void {
    openBoothDrawer(this.store, id, (b) => openBoothForm(this.store, b));
  }

  // ── Gridstack : montage responsive + persistance ──────────────────────────
  private mountGrid(): void {
    const gridEl = this.root.querySelector<HTMLElement>(".grid-stack");
    if (!gridEl) return;
    this.applySavedLayout(gridEl);
    this.grid = GridStack.init(
      {
        column: 6,
        cellHeight: 104,
        margin: 8,
        staticGrid: !this.editing,
        float: false,
        columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 576, c: 1 }, { w: 768, c: 2 }, { w: 1200, c: 3 }] },
      },
      gridEl,
    );
    this.grid.on("change", () => this.persistLayout());
  }

  private applySavedLayout(gridEl: HTMLElement): void {
    const saved = this.store.loadLayout();
    if (!Array.isArray(saved)) return;
    const byId = new Map<string, GridStackNode>();
    for (const nd of saved as GridStackNode[]) if (nd.id) byId.set(String(nd.id), nd);
    for (const item of Array.from(gridEl.querySelectorAll<HTMLElement>(".grid-stack-item"))) {
      const id = item.getAttribute("gs-id");
      const nd = id ? byId.get(id) : undefined;
      if (!nd) continue;
      if (nd.x !== undefined) item.setAttribute("gs-x", String(nd.x));
      if (nd.y !== undefined) item.setAttribute("gs-y", String(nd.y));
      if (nd.w !== undefined) item.setAttribute("gs-w", String(nd.w));
      if (nd.h !== undefined) item.setAttribute("gs-h", String(nd.h));
    }
  }

  private persistLayout(): void {
    if (this.grid) this.store.saveLayout(this.grid.save(false));
  }

  private toggleEditing(): void {
    this.editing = !this.editing;
    if (this.editing) this.filter = null; // pas de filtre pendant l'édition
    this.render();
  }

  // ── Thème clair/sombre ────────────────────────────────────────────────────
  private applyStoredTheme(): void {
    document.documentElement.setAttribute("data-bs-theme", localStorage.getItem(THEME_KEY) ?? "dark");
  }
  private toggleTheme(): void {
    const next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }
}

// ── Helpers de navigation ────────────────────────────────────────────────────
function navItem(label: string, path: string, active: boolean): HTMLElement {
  return el("li", { class: "nav-item" }, [
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
