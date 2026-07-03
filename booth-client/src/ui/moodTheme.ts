// Thème couleur par humeur. Applique des variables CSS sur la racine du document ;
// le parcours ne connaît que applyMoodTheme/resetMoodTheme — la palette vit ici.
// Les animations complexes viendront se greffer sur ces mêmes variables.

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
const MOOD_PALETTES: Readonly<Record<string, MoodPalette>> = {
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
  return MOOD_PALETTES[mood] ?? DEFAULT_PALETTE;
}

/** Applique la palette d'une humeur (transition gérée en CSS sur :root). */
export function applyMoodTheme(mood: string | null): void {
  const p = paletteForMood(mood);
  const root = document.documentElement;
  root.style.setProperty("--accent", p.accent);
  root.style.setProperty("--accent-ink", p.accentInk);
  root.style.setProperty("--bg-halo", p.halo);
  root.dataset.mood = mood ?? "";
}

/** Revient à la palette neutre (retour à l'accueil). */
export function resetMoodTheme(): void {
  applyMoodTheme(null);
}
