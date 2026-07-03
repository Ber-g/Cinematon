// Modèle de domaine du back-office. Préfigure le futur backend (fleet-api) et
// reste extensible : `ownerId`/`managerId` ouvrent la porte à des comptes (et un
// jour à une couche publique) sans re-designer le schéma.

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

/** Rôle de l'utilisateur du back-office. */
export type Role = "operator" | "bar_manager";

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
  /** Propriétaire/gérant — un gérant de bar ne voit que ses cabines. */
  ownerId: string;
  notes: string;
}

/** Utilisateur connecté au back-office (mock pour l'instant). */
export interface CurrentUser {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
}
