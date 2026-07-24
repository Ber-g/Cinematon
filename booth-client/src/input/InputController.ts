// F14 — Contrôleur d'entrée. Point de convergence : agrège des sources d'entrée
// (clavier maintenant ; boutons physiques GPIO / USB-HID plus tard, SANS toucher
// l'UI ni ce contrôleur) et dispatche chaque intention vers le handler de l'écran
// ACTIF — un seul à la fois, calqué sur la state machine de App.

import type { Intent, IntentHandler } from "./intents";

/** Une source d'entrée : commence à émettre des intentions, renvoie un détacheur. */
export interface InputSource {
  attach(emit: (intent: Intent) => void): () => void;
}

export class InputController {
  private handler: IntentHandler | undefined;
  private readonly detachers: Array<() => void> = [];

  constructor(sources: readonly InputSource[]) {
    for (const source of sources) {
      this.detachers.push(source.attach((intent) => this.dispatch(intent)));
    }
  }

  /** Désigne le handler de l'écran actif (undefined = personne n'écoute). */
  setHandler(handler: IntentHandler | undefined): void {
    this.handler = handler;
  }

  private dispatch(intent: Intent): void {
    this.handler?.handle(intent);
  }

  /** Détache toutes les sources. À appeler si l'app est démontée (rare en kiosque). */
  dispose(): void {
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    this.handler = undefined;
  }
}
