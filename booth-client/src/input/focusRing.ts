// F14 — Anneau de focus. Modèle de focus d'un écran : une liste ORDONNÉE d'éléments
// focalisables, un seul focalisé à la fois, navigable au directionnel et validable.
// Garantit qu'AUCUNE action n'est atteignable uniquement au pointeur (SPEC F14) : le
// tactile continue de fonctionner (clic natif), et le clavier / les boutons physiques
// passent par cet anneau.
//
// Volontairement LINÉAIRE (up/left = précédent, down/right = suivant, avec bouclage) :
// les écrans du parcours sont des piles/rangées simples. Une navigation 2D par
// géométrie serait de la sur-ingénierie ici — à réévaluer si un écran l'exige.

import type { Intent, IntentHandler } from "./intents";

export interface FocusRingOptions {
  /** Éléments focalisables, dans l'ordre de navigation. */
  readonly items: readonly HTMLElement[];
  /** Action « retour » de l'écran (Échap / bouton back). Optionnelle. */
  readonly onBack?: () => void;
  /** Index focalisé au montage (défaut 0). */
  readonly initialIndex?: number;
  /** Classe appliquée à l'élément focalisé (défaut « is-focused »). */
  readonly focusedClass?: string;
  /** Déplace le focus DOM réel (element.focus()) en plus de la classe (défaut true). */
  readonly moveDomFocus?: boolean;
}

/**
 * Anneau de focus. Implémente IntentHandler : branché à l'InputController quand son
 * écran est actif. Ne gère que la navigation + validation ; les intentions média
 * (playPause/stop/volume) sont ignorées ici (le lecteur a son propre handler).
 */
export class FocusRing implements IntentHandler {
  private readonly items: readonly HTMLElement[];
  private readonly onBack: (() => void) | undefined;
  private readonly focusedClass: string;
  private readonly moveDomFocus: boolean;
  private index: number;

  constructor(options: FocusRingOptions) {
    this.items = options.items;
    this.onBack = options.onBack;
    this.focusedClass = options.focusedClass ?? "is-focused";
    this.moveDomFocus = options.moveDomFocus ?? true;
    this.index = this.clampIndex(options.initialIndex ?? 0);
    this.render();
  }

  /** Index actuellement focalisé (-1 si aucun élément). */
  get focusedIndex(): number {
    return this.items.length === 0 ? -1 : this.index;
  }

  /** Élément actuellement focalisé, ou undefined si la liste est vide. */
  get focusedElement(): HTMLElement | undefined {
    return this.items[this.index];
  }

  handle(intent: Intent): void {
    switch (intent) {
      case "up":
      case "left":
        this.move(-1);
        break;
      case "down":
      case "right":
        this.move(1);
        break;
      case "confirm":
        this.activate();
        break;
      case "back":
        this.onBack?.();
        break;
      default:
        // Intentions média : hors périmètre de l'anneau de navigation.
        break;
    }
  }

  /** Aligne le focus sur un élément donné (ex. après un appui tactile). No-op si absent. */
  syncTo(element: HTMLElement): void {
    const i = this.items.indexOf(element);
    if (i >= 0 && i !== this.index) {
      this.index = i;
      this.render();
    }
  }

  private move(delta: number): void {
    if (this.items.length === 0) return;
    const n = this.items.length;
    this.index = (this.index + delta + n) % n; // bouclage
    this.render();
  }

  private activate(): void {
    this.focusedElement?.click();
  }

  private clampIndex(i: number): number {
    if (this.items.length === 0) return 0;
    return Math.min(Math.max(0, i), this.items.length - 1);
  }

  private render(): void {
    this.items.forEach((el, i) => {
      const on = i === this.index;
      el.classList.toggle(this.focusedClass, on);
      if (on && this.moveDomFocus) {
        // preventScroll : on gère le défilement nous-mêmes, sans à-coup sur la borne.
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
  }
}
