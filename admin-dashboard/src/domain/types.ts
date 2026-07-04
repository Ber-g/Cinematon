// Modèle de domaine du back-office. Préfigure le futur backend (fleet-api).
// Aligné V2 : multi-organisations avec isolation stricte — `organizationId` sur
// toute entité tenant-scoped (même discipline que `boothId` du jour 1).

/**
 * Statut de SANTÉ — un seul à la fois (exclusif). C'est la couleur dominante de
 * la cabine dans le dashboard. Mappé sur la palette de statut réservée
 * (bon/attention/grave/critique + neutre) — jamais couleur seule (icône+libellé).
 */
export type HealthStatus =
  | "operational" // tout va bien
  | "attention" // à surveiller (stockage faible, sync ancienne…)
  | "error" // en panne / bug bloquant (crash, paiement KO)
  | "offline" // injoignable (plus de heartbeat)
  | "maintenance"; // volontairement hors service (mise à jour)

/**
 * Indicateurs — cumulables (0..n en même temps). Ce sont des drapeaux d'état
 * instantané, orthogonaux à la santé (une cabine opérationnelle peut être
 * `powered` + `in_use`).
 */
export type BoothIndicator = "powered" | "in_use" | "updating";

// ── Multi-organisations (V2) ─────────────────────────────────────────────────

/** Rôle d'un utilisateur AU SEIN d'une organisation. */
export type OrgRole = "super_user" | "manager" | "operator" | "viewer";

export type OrganizationType = "bar" | "festival" | "event";

export interface Organization {
  readonly id: string;
  name: string;
  type: OrganizationType;
  /** Paramètres propres : thème UI + liste blanche de tags d'audience. */
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

/** Type de connexion réseau de la cabine. */
export type ConnectionType = "wifi" | "lte";

/** Point d'historique journalier (pour les graphes du détail cabine). */
export interface DailyStat {
  readonly date: string; // ISO "YYYY-MM-DD"
  readonly sessions: number;
  readonly bandwidthMb: number;
}

/** Ligne de journal / événement d'une cabine (vue debug, opérateur only). */
export interface BoothLog {
  readonly at: number; // epoch ms
  readonly level: "info" | "warn" | "error";
  readonly message: string;
}

/** Télémétrie instantanée d'une cabine. */
export interface BoothTelemetry {
  readonly uptimePct: number; // 0..100 sur 30 j
  readonly temperatureC: number;
  readonly storageFreePct: number; // 0..100
  readonly cpuLoadPct: number; // 0..100
  readonly currentFilmTitle: string | null; // si in_use
  /** Type de connexion réseau. */
  readonly connection: ConnectionType;
  /** Qualité du signal 0..100 (barres). */
  readonly signalPct: number;
}

export interface Booth {
  readonly id: string;
  label: string;
  location: string;
  health: HealthStatus;
  indicators: BoothIndicator[];
  readonly lastHeartbeatAt: number; // epoch ms
  softwareVersion: string;
  sessionsToday: number;
  revenueTodayCents: number;
  telemetry: BoothTelemetry;
  logs: BoothLog[];
  /** Historique journalier (sessions + bande passante) pour les graphes. */
  history: readonly DailyStat[];
  /** Organisation propriétaire (isolation stricte) — remplace `ownerId`. */
  organizationId: string;
  /** Adresse physique (texte). GPS nullable — matériel plus tard. */
  address: string;
  gpsLat: number | null;
  gpsLng: number | null;
  notes: string;
}

/**
 * Identité active dans le back-office (mock). `global_admin` voit tout ; sinon la
 * vue est scopée à `activeOrganizationId` avec le rôle correspondant.
 */
export interface CurrentIdentity {
  readonly user: User;
  readonly activeOrganizationId: string | null;
  readonly role: OrgRole | null;
}

// ── Médias (modèle canonique V2 — types posés maintenant, UI construite en Phase 2) ─

export interface Subtitle {
  readonly lang: string;
  readonly format: "vtt" | "srt";
  readonly url: string;
  readonly workflowStatus: "todo" | "rework" | "verified";
}

export interface Media {
  readonly id: string;
  readonly organizationId: string;
  /** Empreinte SHA-256 — dedup (unique par org) + intégrité. */
  readonly contentHash: string;
  title: string;
  year: number;
  durationSeconds: number;
  language: string;
  editorialTags: string[];
  audienceTags: string[];
  subtitles: Subtitle[];
}

export type StorageType = "local" | "usb" | "object";

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
