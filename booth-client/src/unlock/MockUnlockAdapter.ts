import type { UnlockAdapter, UnlockResult, UnlockStatus } from "./UnlockAdapter";

// Adaptateur de démonstration. Simule un déverrouillage — et surtout ses ÉCHECS
// (refused/timeout/abandoned), afin de pouvoir tester les écrans de repli sans
// aucun matériel — le mock doit simuler aussi les échecs.

export interface MockUnlockOptions {
  /** Issue forcée (utile pour tester un cas précis). Sinon, tirage pondéré. */
  readonly forcedStatus?: UnlockStatus;
  /** Délai simulé avant résolution (ms). */
  readonly delayMs?: number;
}

// Pondération par défaut : le succès domine, mais les échecs arrivent assez
// souvent pour qu'on les rencontre en test manuel.
const DEFAULT_WEIGHTS: ReadonlyArray<readonly [UnlockStatus, number]> = [
  ["success", 0.7],
  ["refused", 0.15],
  ["timeout", 0.1],
  ["abandoned", 0.05],
];

function weightedPick(): UnlockStatus {
  const r = Math.random();
  let acc = 0;
  for (const [status, w] of DEFAULT_WEIGHTS) {
    acc += w;
    if (r <= acc) return status;
  }
  return "success";
}

export class MockUnlockAdapter implements UnlockAdapter {
  readonly method = "mock" as const;

  constructor(private readonly options: MockUnlockOptions = {}) {}

  startUnlock(signal?: AbortSignal): Promise<UnlockResult> {
    const delay = this.options.delayMs ?? 900;
    const status = this.options.forcedStatus ?? weightedPick();

    return new Promise<UnlockResult>((resolve) => {
      if (signal?.aborted) {
        resolve(this.result("abandoned"));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(this.result(status));
      }, delay);

      const onAbort = () => {
        clearTimeout(timer);
        resolve(this.result("abandoned"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private result(status: UnlockStatus): UnlockResult {
    // Le mock est gratuit : aucun montant, aucune référence fournisseur.
    return { status, method: this.method, amount: null, paymentProviderRef: null };
  }
}
