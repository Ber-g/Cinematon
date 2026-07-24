// F13/F19 — Application du style d'organisation en tokens CSS.
//
// La cabine CONSOMME un `OrgStyle` (produit par le settings client F19, bornable par le
// super-admin F20) ; elle ne le produit jamais. Ce module écrit les tokens sémantiques *-base
// EN INLINE sur la racine du document → ils battent les défauts maître (tokens.css) et les
// thèmes, mais restent SOUS l'humeur (qui écrit --mood-*, consulté en priorité par la chaîne
// var() des tokens). Précédence obtenue : maître < org < humeur.
//
// Aujourd'hui : `main.ts` appelle `applyOrgStyle()` sans argument → style MAÎTRE (aucune
// surcharge). Demain : `applyOrgStyle(styleDeLOrg)` sans autre changement (même seam).

import { type OrgStyle, readableInk } from "@kioskoscope/domain";

// Chaque propriété d'org → token CSS ciblé. On vise les *-base pour l'accent et le halo
// (l'humeur les recouvre via --mood-*) ; les autres slots sont écrits directement.
const PALETTE_TOKENS = {
  bg: "--color-bg",
  surface: "--color-surface",
  surfaceRaised: "--color-surface-raised",
  accent: "--color-accent-base",
  accent2: "--color-accent-2",
  text: "--color-text",
  textEmphasis: "--color-text-emphasis",
} as const;

const FONT_TOKENS = {
  display: "--font-display",
  body: "--font-body",
  ui: "--font-ui",
} as const;

// Toutes les propriétés que ce module peut poser — pour les RETIRER proprement au reset
// (F20 : reset au maître = absence de surcharge). Inclut --color-accent-ink-base, calculé.
const MANAGED_PROPS: readonly string[] = [
  ...Object.values(PALETTE_TOKENS),
  ...Object.values(FONT_TOKENS),
  "--color-accent-ink-base",
];

/**
 * Applique un style d'org (ou, sans argument, réinitialise au style maître).
 * Idempotent : retire d'abord toute surcharge précédente, puis applique la nouvelle.
 */
export function applyOrgStyle(style?: OrgStyle): void {
  const root = document.documentElement;

  // Reset : on efface toujours l'état précédent → applyOrgStyle() nu = retour au maître.
  for (const prop of MANAGED_PROPS) root.style.removeProperty(prop);

  if (!style) return;

  if (style.palette) {
    for (const [slot, token] of Object.entries(PALETTE_TOKENS)) {
      const value = style.palette[slot as keyof typeof PALETTE_TOKENS];
      if (value) root.style.setProperty(token, value);
    }
    // Encre de l'accent = contraste auto (WCAG) selon la luminance de l'accent — jamais
    // une décision opérateur. On écrit --color-accent-ink-base ; l'humeur peut la recouvrir.
    // Helper hoisté dans @kioskoscope/domain (source unique cabine + dashboard).
    if (style.palette.accent) {
      root.style.setProperty("--color-accent-ink-base", readableInk(style.palette.accent));
    }
  }

  if (style.fonts) {
    for (const [role, token] of Object.entries(FONT_TOKENS)) {
      const value = style.fonts[role as keyof typeof FONT_TOKENS];
      if (value) root.style.setProperty(token, value);
    }
  }
  // Assets & titre (logos, image d'attente, bandeau, titre) = consommés au rendu des écrans,
  // pas des tokens CSS. Le seam les porte ; leur câblage visuel suivra avec F19.
}
