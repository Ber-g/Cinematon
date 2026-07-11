// Verrouillage kiosque côté application (CIN-072).
//
// La défense PRINCIPALE est côté OS (politique Chromium managée + Xorg `DontVTSwitch` +
// gettys masqués — cf. kiosk/provisioning). Ce module ajoute une couche APP, active
// seulement sur la borne réelle (agent détecté), jamais en dev navigateur :
//   - neutralise le menu contextuel (clic droit / appui long) et la sélection/glisser ;
//   - avale les raccourcis d'évasion ANNULABLES par JS (F11, recherche, zoom clavier…).
//
// ⚠️ Les raccourcis gérés par le navigateur lui-même (Ctrl+T/N/W) ne sont PAS annulables
// en JS — c'est le mode `--kiosk` + la politique managée qui les rendent inertes. Ce guard
// est de la défense en profondeur, pas la ligne de front. Il expose aussi `isKioskLocked()`
// pour que l'UI adapte les éléments qui, sinon, sortiraient de l'app (ex. « En savoir plus »
// → QR au lieu d'un onglet externe).

let locked = false;

/** La borne est-elle en mode verrouillé (kiosque réel) ? Pilote les adaptations d'UI. */
export function isKioskLocked(): boolean {
  return locked;
}

// Raccourcis d'évasion annulables : on les bloque quand ils le sont (defense in depth).
function isEscapeChord(e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (k === "f11" || k === "f12") return true; // plein écran / devtools
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.shiftKey && (k === "i" || k === "j" || k === "c" || k === "q")) return true; // devtools / quit
  if (mod && ["p", "s", "u", "f", "g", "-", "+", "=", "0"].includes(k)) return true; // impression, source, recherche, zoom
  return false;
}

/**
 * Active le verrouillage app. Idempotent. À n'appeler que sur la borne (kioskConfig présent).
 */
export function enableKioskLockdown(): void {
  if (locked) return;
  locked = true;

  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  // Menu contextuel (clic droit + appui long tactile), sélection de texte, glisser.
  document.addEventListener("contextmenu", swallow);
  document.addEventListener("selectstart", swallow);
  document.addEventListener("dragstart", swallow);

  document.addEventListener(
    "keydown",
    (e) => {
      if (isEscapeChord(e) && e.cancelable) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true },
  );

  console.info("[booth] verrouillage kiosque actif (menu contextuel + raccourcis neutralisés).");
}
