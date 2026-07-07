// Auth opérateur OFFLINE (CIN-073, partie borne). Le menu opérateur DOIT s'ouvrir
// même quand le Wi-Fi est tombé (donc sans Supabase). On ne rejoue donc PAS un login
// email/mot de passe en ligne : on valide un PIN contre une table d'accès mise en
// cache localement, poussée par le back-office quand la Kiosk est en ligne.
//
// Le secret est le PIN (jamais stocké en clair) — l'identifiant, lui, est structuré
// et non secret (ex. « PERCHOIR-CAB001-OP »). On hache le PIN en PBKDF2-SHA256 avec
// un sel par entrée ; la vérification est hors ligne, purement locale.
//
// WebCrypto (`globalThis.crypto.subtle`) est présent côté navigateur ET côté Node 20+,
// donc ce module est testable sans DOM.

export type OperatorRole = "global_admin" | "super_user" | "operator";

export interface AccessEntry {
  /** Identifiant opérateur, non secret. Ex. « PERCHOIR-CAB001-OP ». */
  readonly identifier: string;
  /** Empreinte PBKDF2-SHA256 du PIN, en hexadécimal. Jamais le PIN en clair. */
  readonly pinHash: string;
  /** Sel par entrée, en hexadécimal. */
  readonly salt: string;
  /** Nombre d'itérations PBKDF2 utilisées pour cette empreinte. */
  readonly iterations: number;
  readonly role: OperatorRole;
  /** Date d'expiration ISO, ou null = pas d'expiration. */
  readonly expiresAt: string | null;
  readonly revoked: boolean;
}

export interface AccessTable {
  readonly orgId: string;
  readonly boothId: string;
  /** Quand le back-office a poussé cette table (ISO). Sert à afficher la fraîcheur. */
  readonly updatedAt: string;
  readonly entries: readonly AccessEntry[];
}

export type VerifyResult =
  | { ok: true; role: OperatorRole; identifier: string }
  | { ok: false; reason: "invalid" | "expired" | "revoked" };

/**
 * PIN = secret à faible entropie (6 chiffres ≈ 20 bits). Le coût PBKDF2 élevé est
 * la seule barrière si le cache fuit ; on vise ~200 ms/essai sur du matériel modeste.
 * (Le durcissement complémentaire = chiffrement du cache au repos + verrou d'essais UI.)
 */
export const PBKDF2_ITERATIONS = 210_000;
const HASH_BYTES = 32;

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto indisponible (crypto.subtle)");
  return c.subtle;
};

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Sel aléatoire cryptographique, en hexadécimal (défaut 16 octets). */
export function randomSalt(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return toHex(buf);
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Dérive l'empreinte hex d'un PIN pour un sel + un coût donnés (PBKDF2-SHA256). */
export async function hashPin(pin: string, saltHex: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const key = await subtle().importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    key,
    HASH_BYTES * 8,
  );
  return toHex(new Uint8Array(bits));
}

/** Normalise un identifiant pour comparaison (tolère espaces / casse à la saisie). */
export function normalizeIdentifier(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Compare deux chaînes hex en temps ~constant (évite les fuites par timing). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Construit une entrée d'accès (côté back-office / seed). Le PIN n'est jamais
 * conservé : seule l'empreinte l'est.
 */
export async function buildAccessEntry(params: {
  identifier: string;
  pin: string;
  role: OperatorRole;
  expiresAt?: string | null;
  revoked?: boolean;
}): Promise<AccessEntry> {
  const salt = randomSalt();
  const pinHash = await hashPin(params.pin, salt, PBKDF2_ITERATIONS);
  return {
    identifier: normalizeIdentifier(params.identifier),
    pinHash,
    salt,
    iterations: PBKDF2_ITERATIONS,
    role: params.role,
    expiresAt: params.expiresAt ?? null,
    revoked: params.revoked ?? false,
  };
}

/**
 * Valide un couple identifiant + PIN contre la table en cache, hors ligne.
 *
 * L'état d'une entrée (révoquée / expirée) n'est révélé QUE si le PIN est correct :
 * sans le bon PIN, on renvoie toujours « invalid » — pas d'énumération des
 * identifiants ni de leur statut.
 */
export async function verifyOperator(
  table: AccessTable,
  identifier: string,
  pin: string,
  now: number = Date.now(),
): Promise<VerifyResult> {
  const id = normalizeIdentifier(identifier);
  const entry = table.entries.find((e) => e.identifier === id);

  // Identifiant inconnu : on hache quand même (temps ~constant) puis on rejette.
  if (!entry) {
    await hashPin(pin, "00", PBKDF2_ITERATIONS);
    return { ok: false, reason: "invalid" };
  }

  const candidate = await hashPin(pin, entry.salt, entry.iterations);
  if (!constantTimeEqual(candidate, entry.pinHash)) return { ok: false, reason: "invalid" };

  // PIN correct : on peut maintenant révéler l'état sans risque d'énumération.
  if (entry.revoked) return { ok: false, reason: "revoked" };
  if (entry.expiresAt !== null && Date.parse(entry.expiresAt) <= now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, role: entry.role, identifier: entry.identifier };
}
