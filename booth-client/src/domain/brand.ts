// F19 — Marque de la cabine (contenu, pas tokens CSS). `applyOrgStyle` gère la palette/les
// fontes ; ICI vit ce qui s'AFFICHE : titre de marque + image d'attente + logo. Injecté au
// boot par `main.ts` depuis l'`OrgStyle` de l'org (repli = marque maître Kioskoscope), lu par
// les écrans. Même patron que `setCatalog`/`getCatalog`. La cabine ne fait que consommer.
//
// La mention « powered by Kioskoscope » reste NON supprimable côté rendu, quel que soit ce contenu.

export interface BoothBrand {
  /** Titre affiché sur l'écran d'attente (défaut = « KIOSKOSCOPE »). */
  readonly title: string;
  /** Accroche sous le titre (maître ; pas encore pilotable par l'org en v1). */
  readonly tagline: string;
  /** Image d'attente plein cadre (v2 assets). `null` = fond de marque par défaut. */
  readonly idleImageUrl: string | null;
  /** Logo (v2 assets). `null` = titre typographique seul. */
  readonly logoUrl: string | null;
}

const MASTER_BRAND: BoothBrand = {
  title: "KIOSKOSCOPE",
  tagline: "Votre séance de cinéma, rien qu'à vous.",
  idleImageUrl: null,
  logoUrl: null,
};

let current: BoothBrand = MASTER_BRAND;
let custom = false;

/**
 * Pose la marque de l'org. Chaque champ absent/vide retombe sur le maître (jamais d'écran
 * de marque vide). Appelé une fois au boot ; sans argument = retour au maître.
 */
export function setBrand(partial?: Partial<BoothBrand> | null): void {
  if (!partial) {
    current = MASTER_BRAND;
    custom = false;
    return;
  }
  current = {
    title: partial.title?.trim() || MASTER_BRAND.title,
    tagline: partial.tagline?.trim() || MASTER_BRAND.tagline,
    idleImageUrl: partial.idleImageUrl || null,
    logoUrl: partial.logoUrl || null,
  };
  // « Personnalisée » = l'org a posé au moins un élément de marque distinct du maître.
  custom =
    current.title !== MASTER_BRAND.title ||
    current.logoUrl !== null ||
    current.idleImageUrl !== null;
}

/** Marque courante (maître par défaut). */
export function getBrand(): BoothBrand {
  return current;
}

/**
 * La marque affichée est-elle celle d'une org (≠ maître) ? Sert à n'afficher la mention
 * « propulsé par Kioskoscope » (non supprimable) QUE sur une marque personnalisée — inutile
 * quand la marque EST Kioskoscope.
 */
export function isCustomBrand(): boolean {
  return custom;
}
