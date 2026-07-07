// @kioskoscope/domain — modèle de domaine CANONIQUE partagé par toutes les apps
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

// ── Vocabulaire d'humeurs (F6) ───────────────────────────────────────────────
// SOURCE UNIQUE de la taxonomie d'humeurs, partagée par le back-office (saisie),
// le moteur de reco (match `Media.moods`) et le thème Kiosk (palette). Une humeur
// hors de cette liste ne matche NI la reco NI une palette → à ne jamais saisir en
// texte libre. Choix @design : 7 humeurs à température/saturation cohérentes.
export const CANONICAL_MOODS = [
  { key: "apaisant", label: "Apaisant" },
  { key: "mélancolique", label: "Mélancolique" },
  { key: "énergique", label: "Énergique" },
  { key: "léger", label: "Léger" },
  { key: "joyeux", label: "Joyeux" },
  { key: "tendu", label: "Tendu" },
  { key: "sombre", label: "Sombre" },
] as const;

/** Clé d'humeur canonique (union dérivée de {@link CANONICAL_MOODS}). */
export type CanonicalMood = (typeof CANONICAL_MOODS)[number]["key"];

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

// ── Kiosks (Booth) ──────────────────────────────────────────────────────────
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
  /** Catégorie du LIEU où est posée la Kiosk (bar, musée, festival…). Propre à la Kiosk. */
  venueType: string | null;
  notes: string;
  /** Machine signée (DRM) : epoch ms de signature du device, `null` si non signée. */
  readonly signedAt?: number | null;
  /** Référence côté serveur de la clé/cert DRM du device — jamais la clé elle-même. */
  readonly deviceKeyRef?: string | null;
  /** Heure locale (0-23) de la fenêtre de MAJ non urgente (F10). */
  readonly maintenanceHour?: number;
}

// ── Notifications (F15) ──────────────────────────────────────────────────────
// Modèle piloté par CATALOGUE : `type` est une clé libre du registry ci-dessous,
// jamais un enum figé en base → ajouter un type = 0 migration. Préférences à
// l'échelle du USER (globales, tous orgs confondus). Livraison MVP = in-app.
export type NotificationSeverity = "critical" | "warning" | "info";
export type NotificationChannel = "in_app" | "email" | "push" | "sms";

/** Entrée du catalogue de types de notification (définition, pas instance). */
export interface NotificationTypeDef {
  readonly key: string;
  /** Regroupement pour la page de réglages (ex. "Kiosks", "Paiements"). */
  readonly category: string;
  readonly label: string;
  readonly severity: NotificationSeverity;
  /** Canaux cochés par défaut tant que le user n'a pas d'override. */
  readonly defaultChannels: readonly NotificationChannel[];
  /** Rôles pouvant recevoir/voir ce type ; vide = tous les rôles. */
  readonly roleScope: readonly OrgRole[];
  /** Réservé au global_admin (debug/sécurité) — invisible pour les opérateurs. */
  readonly adminOnly?: boolean;
}

/** Une notification délivrée à un user (instance). */
export interface Notification {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string | null;
  readonly type: string;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly body: string;
  readonly boothId: string | null;
  readonly data: Record<string, unknown>;
  readonly readAt: number | null;
  readonly createdAt: number;
}

/** Préférence GLOBALE (per-user) pour un type. Absente ⇒ défauts du catalogue.
 *  `channels` vide ⇒ notif désactivée (muette) pour ce type. */
export interface NotificationPreference {
  readonly userId: string;
  readonly type: string;
  readonly channels: readonly NotificationChannel[];
}

/**
 * CATALOGUE des types de notification — source unique consommée par le rendu de
 * la cloche ET la page de réglages. Amorcé avec des types dérivés de la
 * télémétrie existante ; la liste définitive sera fournie plus tard. Ajouter une
 * entrée ici suffit : aucun changement de schéma ni d'UI requis.
 */
export const NOTIFICATION_TYPES: readonly NotificationTypeDef[] = [
  { key: "booth_offline", category: "Kiosks", label: "Kiosk hors ligne", severity: "critical", defaultChannels: ["in_app"], roleScope: [] },
  { key: "storage_low", category: "Kiosks", label: "Stockage faible", severity: "warning", defaultChannels: ["in_app"], roleScope: [] },
  { key: "temperature_high", category: "Kiosks", label: "Température élevée", severity: "warning", defaultChannels: ["in_app"], roleScope: [] },
  { key: "payment_failed", category: "Paiements", label: "Paiement en échec", severity: "warning", defaultChannels: ["in_app"], roleScope: ["super_user", "manager"] },
  { key: "update_available", category: "Maintenance", label: "Mise à jour disponible", severity: "info", defaultChannels: ["in_app"], roleScope: ["super_user", "manager"] },
];

/** Résout les canaux effectifs d'un type pour un user (override sinon défaut). */
export function resolveChannels(
  typeKey: string,
  prefs: readonly NotificationPreference[],
): readonly NotificationChannel[] {
  const override = prefs.find((p) => p.type === typeKey);
  if (override) return override.channels;
  return NOTIFICATION_TYPES.find((t) => t.key === typeKey)?.defaultChannels ?? [];
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
