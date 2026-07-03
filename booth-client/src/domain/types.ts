// Modèle de domaine — formes de données partagées par toute l'app.
// Aucune logique ici.

/** Méthode ayant déverrouillé une session. `mock`/`free` actifs pour le prototype. */
export type UnlockMethod = "mock" | "card" | "coin" | "token" | "free";

/** Origine d'un film lancé : choisi par l'utilisateur ou proposé par la reco. */
export type PlaySource = "user_choice" | "recommendation";

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
  readonly tags: readonly string[];
}

/**
 * Une session = un parcours de PLUSIEURS films (voir Play). Ne porte jamais de
 * film_id : les films vus sont des lignes Play. `shareToken` est un secret de
 * capacité à haute entropie (jeton non devinable, non séquentiel).
 */
export interface Session {
  readonly id: string;
  readonly boothId: string;
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
