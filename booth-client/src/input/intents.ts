// F14 — Intentions sémantiques. L'UI ne connaît QUE ces intentions ; jamais une
// touche clavier, un bouton physique ou un événement pointeur concret. Les sources
// d'entrée (clavier, GPIO, USB-HID…) traduisent leur signal en Intent ; les écrans
// réagissent à l'Intent. C'est la même philosophie que UnlockAdapter / Recommender :
// changer la source (ou ajouter des boutons physiques) ne touche AUCUNE ligne d'UI.

/** Intentions de navigation + contrôles média. Type canonique, source unique. */
export type Intent =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "playPause"
  | "stop"
  | "volumeUp"
  | "volumeDown";

/** Un écran (ou un composant) capable de réagir aux intentions de l'utilisateur. */
export interface IntentHandler {
  /** Traite une intention. Les intentions non pertinentes sont ignorées en silence. */
  handle(intent: Intent): void;
}
