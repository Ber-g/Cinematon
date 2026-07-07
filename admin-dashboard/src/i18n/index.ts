// i18n (F12 / CIN-041) — infra minimale : dictionnaires FR/EN + `t()` + langue courante.
// Philosophie : simplicité + modularité. Ajouter une chaîne = 1 clé dans les 2 dictionnaires.
// Ajouter une langue = 1 entrée dans DICT. Fallback : clé absente → FR → la clé brute.

export type Lang = "fr" | "en";
export const LANGS: readonly Lang[] = ["fr", "en"];

const LANG_KEY = "cinematon.admin.lang.v1";

// Dictionnaires. Clés namespacées (nav.*, overview.*, kpi.*…). Pilote = nav + vue d'ensemble.
const DICT: Record<Lang, Record<string, string>> = {
  fr: {
    "nav.overview": "Vue d'ensemble",
    "nav.map": "Carte",
    "nav.media": "Médias",
    "nav.revenue": "Revenus",
    "nav.rights": "Droits & redevances",
    "nav.sessions": "Sessions",
    "nav.maintenance": "Maintenance",
    "nav.organization": "Organisation",
    "nav.locked": "Module non inclus dans votre offre — contactez Cinematon pour l'activer",
    "overview.title": "Vue d'ensemble de la flotte",
    "overview.subtitle": "Les cabines de votre organisation.",
    "overview.subtitleAdmin": "Toutes les cabines (global admin).",
    "overview.allBooths": "Toutes les cabines",
    "kpi.booths": "Cabines",
    "kpi.operational": "Opérationnelles",
    "kpi.attention": "Attention",
    "kpi.errorOffline": "En panne / hors-ligne",
    "kpi.sessionsToday": "Sessions (aujourd'hui)",
    "kpi.revenueToday": "Revenu (aujourd'hui)",
    "action.add": "Ajouter",
    "action.edit": "Éditer",
    "action.editDone": "Terminer",
  },
  en: {
    "nav.overview": "Overview",
    "nav.map": "Map",
    "nav.media": "Media",
    "nav.revenue": "Revenue",
    "nav.rights": "Rights & royalties",
    "nav.sessions": "Sessions",
    "nav.maintenance": "Maintenance",
    "nav.organization": "Organization",
    "nav.locked": "Module not included in your plan — contact Cinematon to enable it",
    "overview.title": "Fleet overview",
    "overview.subtitle": "The booths of your organization.",
    "overview.subtitleAdmin": "All booths (global admin).",
    "overview.allBooths": "All booths",
    "kpi.booths": "Booths",
    "kpi.operational": "Operational",
    "kpi.attention": "Attention",
    "kpi.errorOffline": "Down / offline",
    "kpi.sessionsToday": "Sessions (today)",
    "kpi.revenueToday": "Revenue (today)",
    "action.add": "Add",
    "action.edit": "Edit",
    "action.editDone": "Done",
  },
};

function detectLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "fr" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

let currentLang: Lang = detectLang();
const listeners = new Set<() => void>();

/** Traduit une clé. Interpole `{name}` depuis `vars`. Fallback : FR puis la clé brute. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = DICT[currentLang][key] ?? DICT.fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

/** S'abonne aux changements de langue (l'App re-render). Renvoie une fonction de désabonnement. */
export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
