// Cache local de la table d'accès opérateur + journal d'accès (CIN-073, partie borne).
//
// La Kiosk garde en local la dernière table d'accès poussée par le back-office, pour
// valider un opérateur HORS LIGNE. Ici l'implémentation dev/navigateur utilise
// localStorage ; sur la Kiosk réelle, le même contrat (`AccessStore`) sera honoré par
// un fichier CHIFFRÉ au repos (le seam est déjà là — voir CIN-073). Ne pas régresser
// l'interface.
//
// Le journal d'accès est bufferisé localement (qui / quand / quelle action), même hors
// ligne, puis remonté au back-office quand la Kiosk est en ligne (`drain()`).

import { buildAccessEntry, type AccessTable } from "./auth";

const TABLE_KEY = "kioskoscope.booth.access.v1";
const JOURNAL_KEY = "kioskoscope.booth.accesslog.v1";
const JOURNAL_CAP = 500;

/** Contrat de stockage de la table d'accès (même côté Kiosk réelle, chiffré). */
export interface AccessStore {
  load(): AccessTable | null;
  save(table: AccessTable): void;
  clear(): void;
}

export interface AccessLogEntry {
  readonly at: string; // ISO
  readonly identifier: string | null;
  readonly action: string; // "login_ok" | "login_fail" | "wifi_connect" | "restart" | …
  readonly detail?: string;
}

/** Journal d'accès bufferisé, remonté plus tard (`drain`) — jamais perdu hors ligne. */
export interface AccessJournal {
  append(entry: AccessLogEntry): void;
  /** Copie non destructive (affichage / debug). */
  peek(): readonly AccessLogEntry[];
  /** Vide et renvoie le buffer — à appeler au moment de la synchro back-office. */
  drain(): readonly AccessLogEntry[];
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class LocalStorageAccessStore implements AccessStore {
  constructor(private readonly key: string = TABLE_KEY) {}

  load(): AccessTable | null {
    return safeParse<AccessTable>(localStorage.getItem(this.key));
  }

  save(table: AccessTable): void {
    localStorage.setItem(this.key, JSON.stringify(table));
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}

export class LocalStorageAccessJournal implements AccessJournal {
  constructor(private readonly key: string = JOURNAL_KEY) {}

  private read(): AccessLogEntry[] {
    return safeParse<AccessLogEntry[]>(localStorage.getItem(this.key)) ?? [];
  }

  append(entry: AccessLogEntry): void {
    const all = this.read();
    all.push(entry);
    // Cap FIFO : on ne laisse pas le buffer croître sans borne si la synchro traîne.
    const kept = all.length > JOURNAL_CAP ? all.slice(all.length - JOURNAL_CAP) : all;
    localStorage.setItem(this.key, JSON.stringify(kept));
  }

  peek(): readonly AccessLogEntry[] {
    return this.read();
  }

  drain(): readonly AccessLogEntry[] {
    const all = this.read();
    localStorage.removeItem(this.key);
    return all;
  }
}

/**
 * Seed de démonstration (DEV UNIQUEMENT) : permet d'exercer le menu opérateur sans
 * back-office. Crée un opérateur valide + un exemple expiré + un révoqué pour tester
 * les chemins d'échec. À REMPLACER par la table réelle poussée par le back-office.
 */
export async function seedDemoAccessTable(orgId: string, boothId: string): Promise<AccessTable> {
  const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
  const entries = await Promise.all([
    buildAccessEntry({ identifier: "PERCHOIR-CAB001-OP", pin: "246810", role: "operator" }),
    buildAccessEntry({ identifier: "PERCHOIR-CAB001-ADMIN", pin: "135790", role: "super_user" }),
    buildAccessEntry({ identifier: "PERCHOIR-CAB001-OLD", pin: "000000", role: "operator", expiresAt: yesterday }),
    buildAccessEntry({ identifier: "PERCHOIR-CAB001-EX", pin: "111111", role: "operator", revoked: true }),
  ]);
  return { orgId, boothId, updatedAt: new Date().toISOString(), entries };
}
