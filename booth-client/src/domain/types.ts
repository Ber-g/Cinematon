// Modèle de domaine — formes de données partagées par toute l'app.
// Aucune logique ici.

/** Méthode ayant déverrouillé une session. `mock`/`free` actifs pour le prototype. */
export type UnlockMethod = "mock" | "card" | "coin" | "token" | "free";

/** Origine d'un film lancé : choisi par l'utilisateur ou proposé par la reco. */
export type PlaySource = "user_choice" | "recommendation";

/** Sous-titre d'un média (aligné sur le modèle Media V2). */
export interface Subtitle {
  readonly lang: string; // ISO (fr, en…)
  readonly format: "vtt" | "srt";
  readonly url: string;
  readonly workflowStatus: "todo" | "rework" | "verified";
}

/**
 * Un court métrage jouable. Enrichi de métadonnées éditoriales (genres, moods,
 * tags) qui pilotent la recommandation. `tmdbId` est le pivot pour l'export
 * Letterboxd. `storageUrl` pointe vers public/media/… ou est absent (lecture
 * simulée).
 */
export interface Film {
  readonly id: string;
  readonly title: string;
  readonly year: number;
  readonly durationSeconds: number;
  readonly storageUrl: string | null;
  readonly version: number;
  readonly active: boolean;
  readonly tmdbId: number | null;
  readonly genres: readonly string[];
  readonly moods: readonly string[];
  /** Tags éditoriaux (nuit, lent…). Distincts des tags d'audience (whitelist). */
  readonly tags: readonly string[];
  // Valorisation de l'auteur / page « en savoir plus ».
  readonly director: string;
  readonly synopsis: string;
  /** URLs d'images (photogrammes/extraits). Vide => vignettes placeholder. */
  readonly stills: readonly string[];
  /** Lien externe « en savoir plus » (site auteur, fiche film…) ou null. */
  readonly learnMoreUrl: string | null;
  // ── Alignement modèle Media V2 (multi-org) ──────────────────────────────────
  /** Organisation propriétaire du média (isolation stricte). */
  readonly organizationId: string;
  /** Empreinte SHA-256 du fichier (dedup + intégrité). */
  readonly contentHash: string;
  /** Langue principale du média (ISO). */
  readonly language: string;
  /** Tags d'audience pour la whitelist (18+, enfant, bar, festival…). */
  readonly audienceTags: readonly string[];
  /** Sous-titres disponibles. */
  readonly subtitles: readonly Subtitle[];
}

/**
 * Une session = un parcours de PLUSIEURS films (voir Play). Ne porte jamais de
 * film_id : les films vus sont des lignes Play. `shareToken` est un secret de
 * capacité à haute entropie (jeton non devinable, non séquentiel).
 */
export interface Session {
  readonly id: string;
  readonly boothId: string;
  /** Organisation propriétaire de la cabine (isolation stricte, V2). */
  readonly organizationId: string;
  readonly startedAt: number; // epoch ms
  endedAt: number | null;
  readonly shareToken: string;
  readonly unlockMethod: UnlockMethod;
  readonly amount: number | null;
  readonly paymentProviderRef: string | null;
}

/** Un film effectivement lancé dans une session, dans l'ordre (`position`). */
export interface Play {
  readonly id: string;
  readonly sessionId: string;
  readonly filmId: string;
  readonly position: number; // 0-based
  readonly startedAt: number; // epoch ms
  completed: boolean;
  readonly source: PlaySource;
}

/** Critères d'entrée du parcours de choix : humeur et/ou durée souhaitée. */
export interface MoodDurationQuery {
  readonly mood: string | null;
  /** Durée max souhaitée en secondes, ou null = indifférent. */
  readonly maxDurationSeconds: number | null;
}
