import type { Booth, CurrentUser, Role } from "../domain/types";
import { MOCK_BOOTHS } from "./mockFleet";

// Store en mémoire + persistance localStorage des ÉDITIONS (le user peut modifier
// ses données) et de la disposition des widgets. Les données de base viennent du
// mock ; les modifications de l'utilisateur sont réappliquées par-dessus au boot.
// Quand fleet-api existera, ce store deviendra une couche d'accès réseau.

const LS_BOOTHS = "cinematon.admin.booths.v1";
const LS_ROLE = "cinematon.admin.role.v1";
const LS_LAYOUT = "cinematon.admin.layout.v1";

// Utilisateurs mock : bascule de rôle pour la démo.
const USERS: Readonly<Record<Role, CurrentUser>> = {
  operator: { id: "op-admin", name: "Admin (opérateur)", role: "operator" },
  bar_manager: { id: "mgr-perchoir", name: "Gérant · Le Perchoir", role: "bar_manager" },
};

type Listener = () => void;

export class FleetStore {
  private booths: Booth[];
  private user: CurrentUser;
  private listeners = new Set<Listener>();

  constructor() {
    this.booths = this.loadBooths();
    const savedRole = localStorage.getItem(LS_ROLE) as Role | null;
    this.user = USERS[savedRole ?? "operator"];
  }

  // ── Abonnement / rendu ──────────────────────────────────────────────────────
  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ── Rôle ────────────────────────────────────────────────────────────────────
  get currentUser(): CurrentUser {
    return this.user;
  }
  setRole(role: Role): void {
    this.user = USERS[role];
    localStorage.setItem(LS_ROLE, role);
    this.emit();
  }
  get isOperator(): boolean {
    return this.user.role === "operator";
  }

  // ── Lecture ─────────────────────────────────────────────────────────────────
  /** Cabines visibles selon le rôle : opérateur = tout, gérant = les siennes. */
  visibleBooths(): Booth[] {
    if (this.isOperator) return [...this.booths];
    return this.booths.filter((b) => b.ownerId === this.user.id);
  }
  boothById(id: string): Booth | undefined {
    return this.booths.find((b) => b.id === id);
  }

  // ── Écriture (données éditables) ────────────────────────────────────────────
  upsertBooth(booth: Booth): void {
    const idx = this.booths.findIndex((b) => b.id === booth.id);
    if (idx >= 0) this.booths[idx] = booth;
    else this.booths.push(booth);
    this.persistBooths();
    this.emit();
  }
  deleteBooth(id: string): void {
    this.booths = this.booths.filter((b) => b.id !== id);
    this.persistBooths();
    this.emit();
  }

  // ── Disposition des widgets (layout éditable) ───────────────────────────────
  loadLayout(): unknown | null {
    const raw = localStorage.getItem(LS_LAYOUT);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  saveLayout(layout: unknown): void {
    localStorage.setItem(LS_LAYOUT, JSON.stringify(layout));
  }
  resetLayout(): void {
    localStorage.removeItem(LS_LAYOUT);
    this.emit();
  }

  // ── Persistance interne ─────────────────────────────────────────────────────
  private persistBooths(): void {
    localStorage.setItem(LS_BOOTHS, JSON.stringify(this.booths));
  }
  private loadBooths(): Booth[] {
    const raw = localStorage.getItem(LS_BOOTHS);
    if (raw) {
      try {
        return JSON.parse(raw) as Booth[];
      } catch {
        /* retombe sur le mock */
      }
    }
    return MOCK_BOOTHS.map((b) => structuredClone(b));
  }
}
