import type { Film, Play, PlaySource, Session, UnlockMethod } from "../domain/types";

// Gère le cycle de vie d'une session côté cabine : création, enregistrement des
// films lancés (Play), clôture. Pour l'instant tout est en mémoire ; la remontée
// vers le backend viendra plus tard (aucune dépendance réseau ici).

/**
 * Génère un share_token non devinable — CSPRNG, 16 octets = 128 bits d'entropie,
 * encodé base64url. La route publique /s/{token} doit reposer sur un secret de
 * capacité, pas un ID énumérable.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomId(prefix: string): string {
  // Identifiant local lisible ; unicité suffisante pour une cabine unique.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class SessionManager {
  private session: Session | null = null;
  private plays: Play[] = [];

  constructor(private readonly boothId: string) {}

  /** Démarre une session après un déverrouillage réussi. */
  start(unlockMethod: UnlockMethod, amount: number | null, paymentProviderRef: string | null): Session {
    const now = Date.now();
    this.session = {
      id: randomId("sess"),
      boothId: this.boothId,
      startedAt: now,
      endedAt: null,
      shareToken: generateShareToken(),
      unlockMethod,
      amount,
      paymentProviderRef,
    };
    this.plays = [];
    return this.session;
  }

  /** Enregistre le lancement d'un film. `source` distingue choix vs reco (North Star). */
  recordPlayStart(film: Film, source: PlaySource): Play {
    const session = this.requireSession();
    const play: Play = {
      id: randomId("play"),
      sessionId: session.id,
      filmId: film.id,
      position: this.plays.length,
      startedAt: Date.now(),
      completed: false,
      source,
    };
    this.plays.push(play);
    return play;
  }

  /** Marque le dernier film comme terminé (atteint la fin, pas interrompu). */
  markPlayCompleted(playId: string): void {
    const play = this.plays.find((p) => p.id === playId);
    if (play) play.completed = true;
  }

  /** Clôt la session et renvoie un instantané figé (session + plays). */
  end(): { session: Session; plays: readonly Play[] } {
    const session = this.requireSession();
    session.endedAt = Date.now();
    const snapshot = { session, plays: [...this.plays] };
    this.session = null;
    this.plays = [];
    return snapshot;
  }

  get current(): Session | null {
    return this.session;
  }

  get currentPlays(): readonly Play[] {
    return this.plays;
  }

  private requireSession(): Session {
    if (!this.session) throw new Error("Aucune session active");
    return this.session;
  }
}
