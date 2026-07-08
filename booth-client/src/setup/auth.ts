// Auth opérateur OFFLINE (CIN-073, F17 volet A).
//
// La logique (hachage PBKDF2, vérif temps ~constant, anti-énumération) a été HOISTÉE
// vers `@kioskoscope/domain` (source unique) le 2026-07-08 : le booth-client vérifie
// hors ligne, l'admin-dashboard hache à la création → la constante de coût ne peut plus
// diverger. Ce module reste un ré-export pour ne pas casser les imports existants.

export {
  PBKDF2_ITERATIONS,
  randomSalt,
  hashPin,
  normalizeIdentifier,
  buildAccessEntry,
  verifyOperator,
} from "@kioskoscope/domain";

export type {
  OperatorRole,
  AccessEntry,
  AccessTable,
  VerifyResult,
} from "@kioskoscope/domain";
