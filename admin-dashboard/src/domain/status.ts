import type { BoothIndicator, ConnectionType, HealthStatus } from "./types";
import { t } from "../i18n";

// Vocabulaire de statut (@design). Chaque statut de santé porte : un libellé
// clair, une couleur sémantique Tabler (déjà accessible AA), et une icône —
// pour ne JAMAIS reposer sur la couleur seule (daltonisme, impression N&B).

export interface StatusMeta {
  readonly label: string;
  /** Nom de couleur Tabler/Bootstrap : green/yellow/red/… */
  readonly color: string;
  /** Description courte pour tooltip/aide. */
  readonly hint: string;
  /** Chemin SVG (24x24, stroke) de l'icône. */
  readonly iconPath: string;
}

// Icônes (style Tabler, tracé stroke). Un seul path par icône pour rester léger.
const ICON = {
  check: "M5 12l5 5l10 -10",
  alert: "M12 9v4M12 16v.01M12 3l9 16H3z",
  bug: "M9 9v-1a3 3 0 0 1 6 0v1M8 9h8a4 4 0 0 1 4 4v3a6 6 0 0 1 -12 0v-3a4 4 0 0 1 0 0zM3 13h4M17 13h4M12 20v-8",
  plug: "M9 7v-3M15 7v-3M9 17v3M15 17v3M7 7h10v4a5 5 0 0 1 -10 0z",
  tool: "M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8z",
} as const;

const HEALTH_META: Readonly<Record<HealthStatus, StatusMeta>> = {
  operational: { label: "Opérationnel", color: "green", hint: "Tout fonctionne normalement.", iconPath: ICON.check },
  attention: { label: "Attention", color: "yellow", hint: "À surveiller (stockage, sync, batterie…).", iconPath: ICON.alert },
  error: { label: "En panne", color: "red", hint: "Bug bloquant : crash ou paiement KO.", iconPath: ICON.bug },
  offline: { label: "Hors-ligne", color: "secondary", hint: "Injoignable — plus de signal de vie.", iconPath: ICON.plug },
  maintenance: { label: "Maintenance", color: "blue", hint: "Hors service volontaire (mise à jour).", iconPath: ICON.tool },
};

export function healthMeta(status: HealthStatus): StatusMeta {
  // Libellé/hint traduits (i18n) ; couleur + icône restent statiques.
  return { ...HEALTH_META[status], label: t(`health.${status}`), hint: t(`health.${status}.hint`) };
}

export function allHealthStatuses(): readonly HealthStatus[] {
  return ["operational", "attention", "error", "offline", "maintenance"];
}

export function indicatorLabel(ind: BoothIndicator): string {
  return t(`indicator.${ind}`);
}

// Connexion réseau : libellé + icône (Wifi ondulé / antenne LTE).
export interface ConnectionMeta {
  readonly label: string;
  readonly iconPath: string;
}

const CONNECTION_META: Readonly<Record<ConnectionType, ConnectionMeta>> = {
  wifi: { label: "Wi-Fi", iconPath: "M12 18h.01M5 12a10 10 0 0 1 14 0M8.5 15a6 6 0 0 1 7 0M2 9a15 15 0 0 1 20 0" },
  lte: { label: "LTE (4G)", iconPath: "M6 18v-6M10 18v-9M14 18v-4M18 18v-11M3 21h18" },
};

export function connectionMeta(type: ConnectionType): ConnectionMeta {
  return CONNECTION_META[type];
}
