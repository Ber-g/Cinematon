// @cinematon/domain — modèle de domaine CANONIQUE partagé par toutes les apps
// (booth-client, admin-dashboard, fleet-api). Source de vérité unique des entités
// et énumérations. Aligné V2 : multi-organisations, isolation par `organizationId`.
//
// Règle : une entité tenant-scoped porte TOUJOURS `organizationId`.

// ── Énumérations ─────────────────────────────────────────────────────────────
export type UnlockMethod = "mock" | "card" | "coin" | "token" | "free";
export type PlaySource = "user_choice" | "recommendation";
export type OrgRole = "super_user" | "manager" | "operator" | "viewer";
export type OrganizationType = "bar" | "festival" | "event";
export type HealthStatus = "operational" | "attention" | "error" | "offline" | "maintenance";
export type BoothIndicator = "powered" | "in_use" | "updating";
export type ConnectionType = "wifi" | "lte";
export type StorageType = "local" | "usb" | "object";

// ── Tenancy : organisations, utilisateurs, appartenances ─────────────────────
export interface Organization {
  readonly id: string;
  name: string;
  type: OrganizationType;
  /** Région d'opération. Règle : 1 org = 1 région (code libre "FR", "BE"…), nullable au départ. */
  region?: string | null;
  /** Devise ISO-4217 (défaut EUR). Pilote le formatage monétaire de l'org. */
  currency?: string;
  settings: { themeId?: string; whitelistTags: string[] };
}

export interface User {
  readonly id: string;
  name: string;
  email: string;
  /** Accès transverse à TOUT (l'exploitant). Contourne le scoping par org. */
  isGlobalAdmin: boolean;
}

/** Appartenance user × organisation × rôle (un user a 0..n memberships). */
export interface Membership {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: OrgRole;
}

// ── Médias ───────────────────────────────────────────────────────────────────
export interface Subtitle {
  readonly lang: string; // ISO (fr, en…)
  readonly format: "vtt" | "srt";
  readonly url: string;
  readonly workflowStatus: "todo" | "rework" | "verified";
}

/**
 * Média canonique (un court métrage). Tenant-scoped. `contentHash` (SHA-256) =
 * dedup (unique par org) + intégrité. Les apps peuvent en exposer un sous-ensemble.
 */
export interface Media {
  readonly id: string;
  readonly organizationId: string;
  readonly contentHash: string;
  readonly title: string;
  readonly year: number;
  readonly durationSeconds: number;
  readonly storageUrl: string | null;
  readonly version: number;
  readonly active: boolean;
  readonly tmdbId: number | null;
  readonly genres: readonly string[];
  readonly moods: readonly string[];
  /** Tags éditoriaux (nuit, lent…), distincts des tags d'audience. */
  readonly tags: readonly string[];
  /** Tags d'audience pour la whitelist (18+, enfant, bar, festival…). */
  readonly audienceTags: readonly string[];
  readonly language: string;
  readonly subtitles: readonly Subtitle[];
  readonly director: string;
  readonly synopsis: string;
  readonly stills: readonly string[];
  readonly learnMoreUrl: string | null;
  /** Validation humaine (opérateur) : epoch ms de la validation, `null` si non validée. */
  readonly reviewedAt: number | null;
  /** Id de l'utilisateur ayant validé (audit), `null` si non validée. */
  readonly reviewedBy: string | null;
  /** Protection du fichier (anti-copie). La DRM elle-même est portée par la borne signée. */
  readonly protection?: "none" | "encrypted" | "drm";
  /** Schéma DRM si `protection = 'drm'` (widevine, playready, fairplay, custom). */
  readonly drmScheme?: string | null;
  /** Le master a été livré déjà protégé par le distributeur. */
  readonly sourceProtected?: boolean;
}

export interface StorageLocation {
  readonly id: string;
  readonly boothId: string;
  readonly type: StorageType;
  label: string;
  capacityBytes: number;
  freeBytes: number;
}

/** Présence physique d'un média sur un support de stockage. */
export interface MediaInstance {
  readonly id: string;
  readonly mediaId: string;
  readonly storageLocationId: string;
}

// ── Cabines (Booth) ──────────────────────────────────────────────────────────
export interface DailyStat {
  readonly date: string; // ISO "YYYY-MM-DD"
  readonly sessions: number;
  readonly bandwidthMb: number;
}

export interface BoothLog {
  readonly at: number; // epoch ms
  readonly level: "info" | "warn" | "error";
  readonly message: string;
}

export interface BoothTelemetry {
  readonly uptimePct: number;
  readonly temperatureC: number;
  readonly storageFreePct: number;
  readonly cpuLoadPct: number;
  readonly currentFilmTitle: string | null;
  readonly connection: ConnectionType;
  readonly signalPct: number;
}

export interface Booth {
  readonly id: string;
  label: string;
  location: string;
  health: HealthStatus;
  indicators: BoothIndicator[];
  readonly lastHeartbeatAt: number;
  softwareVersion: string;
  sessionsToday: number;
  revenueTodayCents: number;
  telemetry: BoothTelemetry;
  logs: BoothLog[];
  history: readonly DailyStat[];
  /** Organisation propriétaire (isolation stricte). */
  organizationId: string;
  address: string;
  gpsLat: number | null;
  gpsLng: number | null;
  notes: string;
  /** Machine signée (DRM) : epoch ms de signature du device, `null` si non signée. */
  readonly signedAt?: number | null;
  /** Référence côté serveur de la clé/cert DRM du device — jamais la clé elle-même. */
  readonly deviceKeyRef?: string | null;
  /** Heure locale (0-23) de la fenêtre de MAJ non urgente (F10). */
  readonly maintenanceHour?: number;
}

// ── Sessions & lectures ──────────────────────────────────────────────────────
export interface Session {
  readonly id: string;
  readonly boothId: string;
  readonly organizationId: string;
  readonly startedAt: number; // epoch ms
  endedAt: number | null;
  readonly shareToken: string;
  readonly unlockMethod: UnlockMethod;
  readonly amount: number | null;
  readonly paymentProviderRef: string | null;
}

export interface Play {
  readonly id: string;
  readonly sessionId: string;
  readonly filmId: string;
  readonly position: number; // 0-based
  readonly startedAt: number;
  completed: boolean;
  readonly source: PlaySource;
}
