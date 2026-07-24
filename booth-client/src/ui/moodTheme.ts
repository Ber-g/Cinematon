// Thème couleur par humeur. Écrit les tokens sémantiques d'humeur (--mood-*) EN INLINE sur
// la racine ; le parcours ne connaît que applyMoodTheme/resetMoodTheme — la palette vit ici.
//
// F13 : l'humeur est le NIVEAU LE PLUS FORT de la précédence (maître < org < humeur). Elle
// n'écrit QUE l'accent et le halo, via --mood-accent / --mood-accent-ink / --mood-halo, que
// la chaîne var() des tokens (tokens.css) consulte en priorité. Le reset RETIRE ces variables
// → l'accent retombe sur le style d'org (ou maître), sans valeur codée en dur.

import type { CanonicalMood } from "@kioskoscope/domain";

export interface MoodPalette {
  /** Couleur d'accent (boutons, halos, éléments actifs). */
  readonly accent: string;
  /** Encre lisible SUR l'accent (contraste AA visé). */
  readonly accentInk: string;
  /** Teinte du halo/dégradé de fond (ambiance). */
  readonly halo: string;
}

// Palette neutre par défaut (hors humeur) — ambre projecteur.
export const DEFAULT_PALETTE: MoodPalette = {
  accent: "#e8b45a",
  accentInk: "#1a1206",
  halo: "#16121f",
};

// Choix @design : chaque humeur porte une température et une saturation cohérentes
// avec son ressenti. Encre sombre partout (accents mi-tons) → contraste lisible.
// Clé = humeur canonique du domaine : TS impose une palette pour CHAQUE humeur
// (ajouter une humeur au domaine sans palette ici casse le build → pas d'oubli).
const MOOD_PALETTES: Readonly<Record<CanonicalMood, MoodPalette>> = {
  apaisant: { accent: "#6fbfa8", accentInk: "#06201a", halo: "#0e1a18" },
  mélancolique: { accent: "#7d8fce", accentInk: "#0a1020", halo: "#12131f" },
  énergique: { accent: "#ef8354", accentInk: "#1f0e06", halo: "#1f1410" },
  léger: { accent: "#e8c46a", accentInk: "#1c1606", halo: "#1c1810" },
  joyeux: { accent: "#f28ea0", accentInk: "#210d13", halo: "#1f1216" },
  tendu: { accent: "#e5544b", accentInk: "#210a08", halo: "#1a0f0f" },
  sombre: { accent: "#8a7fa8", accentInk: "#120e1a", halo: "#141018" },
};

export function paletteForMood(mood: string | null): MoodPalette {
  if (mood === null) return DEFAULT_PALETTE;
  // `mood` vient du catalogue (string) : lookup tolérant, repli neutre si non canonique.
  return (MOOD_PALETTES as Record<string, MoodPalette>)[mood] ?? DEFAULT_PALETTE;
}

/** Applique l'accent d'une humeur (transition gérée en CSS). `null` = retour au neutre. */
export function applyMoodTheme(mood: string | null): void {
  // Humeur nulle = accueil : on retire les surcharges → l'accent retombe sur org/maître.
  if (mood === null) {
    resetMoodTheme();
    return;
  }
  const p = paletteForMood(mood);
  const root = document.documentElement;
  root.style.setProperty("--mood-accent", p.accent);
  root.style.setProperty("--mood-accent-ink", p.accentInk);
  root.style.setProperty("--mood-halo", p.halo);
  root.dataset.mood = mood;
}

/** Revient à l'accent neutre (org/maître) en retirant les surcharges d'humeur. */
export function resetMoodTheme(): void {
  const root = document.documentElement;
  root.style.removeProperty("--mood-accent");
  root.style.removeProperty("--mood-accent-ink");
  root.style.removeProperty("--mood-halo");
  root.dataset.mood = "";
}
