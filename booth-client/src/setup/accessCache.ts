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

// ── Cache chiffré au repos (CIN-073 S4) ──────────────────────────────────────
// La table d'accès contient des EMPREINTES de PIN : au repos sur la Kiosk elle doit
// être chiffrée. Chiffrement AES-GCM (WebCrypto), clé dérivée (PBKDF2) d'un SECRET
// fourni par le runtime — jamais stocké à côté du chiffré. En dev/navigateur le secret
// vient des identifiants device (provisionnés, hors bundle sur la vraie Kiosk) ; sur la
// Kiosk packagée il DOIT venir du trousseau de l'OS, jamais du bundle.
//
// Façade SYNCHRONE (même contrat `AccessStore`) : on déchiffre une fois à l'hydratation
// (async, au démarrage) puis `load()` renvoie le cache mémoire ; `save()` persiste en
// chiffrant en arrière-plan. `operatorMenu` (qui appelle `load()` sync) reste inchangé.
const ENC_KEY = "kioskoscope.booth.access.enc.v1";

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str: string): Uint8Array {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveAesKey(secret: string, salt: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 210_000 },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export class EncryptedAccessStore implements AccessStore {
  private cache: AccessTable | null = null;

  private constructor(
    private readonly key: CryptoKey,
    private readonly storageKey: string,
  ) {}

  /** Dérive la clé du `secret` (+ `salt` non secret, ex. boothId) et hydrate le cache. */
  static async create(secret: string, salt: string, storageKey: string = ENC_KEY): Promise<EncryptedAccessStore> {
    const key = await deriveAesKey(secret, salt);
    const store = new EncryptedAccessStore(key, storageKey);
    await store.hydrate();
    return store;
  }

  private async hydrate(): Promise<void> {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const buf = b64decode(raw);
      const iv = buf.slice(0, 12);
      const ct = buf.slice(12);
      const pt = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, ct);
      this.cache = JSON.parse(new TextDecoder().decode(new Uint8Array(pt))) as AccessTable;
    } catch {
      // Clé changée / données corrompues : on repart sans cache (la prochaine sync repeuple).
      this.cache = null;
    }
  }

  load(): AccessTable | null {
    return this.cache;
  }

  save(table: AccessTable): void {
    this.cache = table;
    void this.persist(table);
  }

  clear(): void {
    this.cache = null;
    localStorage.removeItem(this.storageKey);
  }

  private async persist(table: AccessTable): Promise<void> {
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const pt = new TextEncoder().encode(JSON.stringify(table));
    const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, pt));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    localStorage.setItem(this.storageKey, b64encode(out));
  }
}
