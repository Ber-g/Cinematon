// F14 — Source d'entrée clavier. Traduit les touches en intentions sémantiques.
// Sert le pilotage clavier (accessibilité + dev) ET sert de modèle : une future
// source « boutons physiques » (USB-HID/GPIO) émettra les MÊMES intentions.

import type { Intent } from "../intents";
import type { InputSource } from "../InputController";

/** Mappe un événement clavier vers une intention, ou null si non pertinent. */
export function mapKeyToIntent(ev: KeyboardEvent): Intent | null {
  switch (ev.key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "Enter":
    case " ":
    case "Spacebar": // anciens navigateurs
      return "confirm";
    case "Escape":
    case "Backspace":
      return "back";
    // Contrôles média : touches dédiées + repli lettres (claviers sans touches média).
    case "MediaPlayPause":
    case "k":
      return "playPause";
    case "MediaStop":
      return "stop";
    case "AudioVolumeUp":
      return "volumeUp";
    case "AudioVolumeDown":
      return "volumeDown";
    default:
      return null;
  }
}

export class KeyboardInputSource implements InputSource {
  constructor(private readonly target: EventTarget = window) {}

  attach(emit: (intent: Intent) => void): () => void {
    const onKeyDown = (ev: Event): void => {
      const intent = mapKeyToIntent(ev as KeyboardEvent);
      if (intent === null) return;
      // On consomme la touche : pas de scroll de page ni de double action.
      ev.preventDefault();
      emit(intent);
    };
    this.target.addEventListener("keydown", onKeyDown);
    return () => this.target.removeEventListener("keydown", onKeyDown);
  }
}
