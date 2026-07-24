// F13 accessibilité — mode « haute visibilité ». Bascule l'attribut `data-contrast=high` sur la
// racine → contrastes renforcés (lignes, texte atténué) + focus élargi, définis dans tokens.css
// (`:root[data-contrast="high"]`). Orthogonal au thème clair/sombre : se pose par-dessus.
//
// Choix PERSISTANT (localStorage) : un lieu très lumineux le règle une fois pour toutes. Piloté
// depuis le menu opérateur (surface de service), jamais imposé au visiteur par surprise.

const STORAGE_KEY = "ko-contrast";

/** Le mode haute visibilité est-il actif ? */
export function isHighContrast(): boolean {
  return document.documentElement.dataset.contrast === "high";
}

/** Active/désactive le mode haute visibilité et mémorise le choix. */
export function setHighContrast(on: boolean): void {
  if (on) document.documentElement.dataset.contrast = "high";
  else delete document.documentElement.dataset.contrast;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Stockage indisponible (mode privé, quota) : non bloquant — le réglage tient pour la session.
  }
}

/** Restaure le choix mémorisé au démarrage. À appeler une fois au boot. */
export function initAccessibility(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // ignore : pas de préférence récupérable.
  }
  if (saved === "1") document.documentElement.dataset.contrast = "high";
}
