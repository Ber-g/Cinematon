import type { Film, MoodDurationQuery, Play } from "../domain/types";

// Interface UNIQUE de recommandation. Séparation stricte moteur / peau :
// remplacer l'algorithme ne doit toucher AUCUNE ligne d'UI. L'implémentation
// prototype (RuleBasedRecommender) applique des règles simples sur les métadonnées.

export interface RecoContext {
  /** Films déjà vus dans la session — ne jamais re-recommander. */
  readonly alreadyPlayed: readonly Play[];
  /** Critères d'entrée du parcours de choix (humeur/durée). */
  readonly query: MoodDurationQuery;
}

export interface Recommender {
  /**
   * Retourne les films recommandés, meilleurs en premier. Ne retourne JAMAIS un
   * film absent du catalogue actif fourni, ni un film déjà vu dans la session.
   */
  recommend(catalog: readonly Film[], context: RecoContext): readonly Film[];
}
