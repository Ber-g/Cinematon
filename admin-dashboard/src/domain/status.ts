import type { BoothIndicator, HealthStatus } from "./types";

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
  return HEALTH_META[status];
}

export function allHealthStatuses(): readonly HealthStatus[] {
  return ["operational", "attention", "error", "offline", "maintenance"];
}

const INDICATOR_LABEL: Readonly<Record<BoothIndicator, string>> = {
  powered: "Sous tension",
  in_use: "En cours d'utilisation",
  updating: "Mise à jour",
};

export function indicatorLabel(ind: BoothIndicator): string {
  return INDICATOR_LABEL[ind];
}
