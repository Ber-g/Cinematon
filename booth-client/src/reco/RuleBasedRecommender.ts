import type { Film } from "../domain/types";
import type { RecoContext, Recommender } from "./Recommender";

// Implémentation prototype : règles simples sur les métadonnées. Score chaque
// film candidat selon l'adéquation humeur/durée, exclut les films déjà vus.
// Remplaçable par n'importe quel autre moteur sans toucher à l'UI.

const MOOD_MATCH_WEIGHT = 10;
const DURATION_FIT_WEIGHT = 3;

export class RuleBasedRecommender implements Recommender {
  recommend(catalog: readonly Film[], context: RecoContext): readonly Film[] {
    const seen = new Set(context.alreadyPlayed.map((p) => p.filmId));
    const { mood, maxDurationSeconds } = context.query;

    const scored = catalog
      .filter((f) => f.active && !seen.has(f.id))
      .filter((f) => maxDurationSeconds === null || f.durationSeconds <= maxDurationSeconds)
      .map((film) => ({ film, score: this.score(film, mood, maxDurationSeconds) }))
      .sort((a, b) => b.score - a.score);

    return scored.map((s) => s.film);
  }

  private score(film: Film, mood: string | null, maxDurationSeconds: number | null): number {
    let score = 0;

    // Correspondance d'humeur : le signal le plus fort.
    if (mood !== null && film.moods.includes(mood)) {
      score += MOOD_MATCH_WEIGHT;
    }

    // Adéquation de durée : plus le film est proche (sous) la durée max, mieux
    // c'est — on récompense l'usage de l'enveloppe de temps sans la dépasser.
    if (maxDurationSeconds !== null && film.durationSeconds <= maxDurationSeconds) {
      const fit = film.durationSeconds / maxDurationSeconds; // 0..1
      score += fit * DURATION_FIT_WEIGHT;
    }

    // Léger bruit déterministe-évitant pour éviter un ordre figé entre ex æquo.
    score += Math.random() * 0.5;

    return score;
  }
}
