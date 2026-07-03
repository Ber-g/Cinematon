import type { UnlockMethod } from "../domain/types";

// Interface UNIQUE de déverrouillage. Le parcours ne connaît que cette
// interface — jamais un fournisseur de paiement concret. On branche mock/free
// maintenant, card (Stripe Terminal)/coin plus tard SANS toucher au parcours.

export type UnlockStatus = "success" | "refused" | "timeout" | "abandoned";

export interface UnlockResult {
  readonly status: UnlockStatus;
  readonly method: UnlockMethod;
  /** Montant débité en centimes si applicable (null pour free/mock gratuit). */
  readonly amount: number | null;
  /** Référence côté fournisseur (null tant qu'aucun vrai paiement). */
  readonly paymentProviderRef: string | null;
}

export interface UnlockAdapter {
  readonly method: UnlockMethod;
  /**
   * Lance une tentative de déverrouillage. Résout toujours (jamais de throw) :
   * les échecs sont des UnlockResult, pas des exceptions — le parcours doit
   * pouvoir afficher un écran de repli non-technique pour chaque cas.
   * `signal` permet au parcours d'annuler (ex : retour à l'accueil).
   */
  startUnlock(signal?: AbortSignal): Promise<UnlockResult>;
}
