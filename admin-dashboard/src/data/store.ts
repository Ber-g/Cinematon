import type { Booth, CurrentIdentity, User } from "../domain/types";
import { MOCK_BOOTHS, MOCK_MEMBERSHIPS, MOCK_USERS } from "./mockFleet";

// Store en mémoire + persistance localStorage des ÉDITIONS et de la disposition.
// Aligné V2 : l'accès aux cabines est SCOPÉ par organisation (isolation stricte).
// ⚠️ Ici le scoping est fait côté client (mock) ; en Phase 1, l'isolation réelle
// sera appliquée par `fleet-api` à chaque endpoint (jamais en filtrage UI seul).

const LS_BOOTHS = "cinematon.admin.booths.v2";
const LS_IDENTITY = "cinematon.admin.identity.v2";
const LS_LAYOUT = "cinematon.admin.layout.v1";

type Listener = () => void;

/** Deux identités de démo : global_admin (voit tout) vs super_user d'une org. */
function identityFor(userId: string): CurrentIdentity {
  const user = MOCK_USERS.find((u) => u.id === userId) ?? (MOCK_USERS[0] as User);
  if (user.isGlobalAdmin) return { user, activeOrganizationId: null, role: null };
  const membership = MOCK_MEMBERSHIPS.find((m) => m.userId === user.id);
  return {
    user,
    activeOrganizationId: membership?.organizationId ?? null,
    role: membership?.role ?? null,
  };
}

export class FleetStore {
  private booths: Booth[];
  private identity: CurrentIdentity;
  private listeners = new Set<Listener>();

  constructor() {
    this.booths = this.loadBooths();
    this.identity = identityFor(localStorage.getItem(LS_IDENTITY) ?? "user-admin");
  }

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ── Identité / rôle ─────────────────────────────────────────────────────────
  get current(): CurrentIdentity {
    return this.identity;
  }
  /** `global_admin` = accès total, y compris debug/shell des machines. */
  get isGlobalAdmin(): boolean {
    return this.identity.user.isGlobalAdmin;
  }
  switchUser(userId: string): void {
    this.identity = identityFor(userId);
    localStorage.setItem(LS_IDENTITY, userId);
    this.emit();
  }

  // ── Lecture (SCOPÉE par organisation — isolation) ───────────────────────────
  /** global_admin → toutes les cabines ; sinon uniquement celles de son org. */
  visibleBooths(): Booth[] {
    if (this.isGlobalAdmin) return [...this.booths];
    const orgId = this.identity.activeOrganizationId;
    return orgId ? this.booths.filter((b) => b.organizationId === orgId) : [];
  }
  /** Respecte l'isolation : ne renvoie une cabine que si elle est visible. */
  boothById(id: string): Booth | undefined {
    return this.visibleBooths().find((b) => b.id === id);
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
