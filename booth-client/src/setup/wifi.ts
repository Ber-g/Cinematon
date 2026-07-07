// Gestion Wi-Fi — MOCK. Le navigateur ne peut pas piloter le Wi-Fi de la machine ;
// sur la cabine réelle (Linux), ce module appellera un service local
// (nmcli / wpa_supplicant) via une petite API locale — voir CIN-071. L'interface
// publique (scan / connect / current) reste identique, seule l'implémentation change.

export interface WifiNetwork {
  readonly ssid: string;
  readonly signalPct: number;
  readonly secured: boolean;
}

export interface WifiConnectResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Contrat que la cabine réelle (service nmcli) devra honorer à l'identique. */
export interface WifiAdapter {
  readonly current: string | null;
  scan(): Promise<readonly WifiNetwork[]>;
  connect(network: WifiNetwork, password: string): Promise<WifiConnectResult>;
}

const MOCK_NETWORKS: readonly WifiNetwork[] = [
  { ssid: "Bar-Le-Perchoir", signalPct: 88, secured: true },
  { ssid: "Perchoir-Guest", signalPct: 72, secured: false },
  { ssid: "Livebox-4F2A", signalPct: 54, secured: true },
  { ssid: "iPhone de Léa", signalPct: 33, secured: true },
];

export class WifiManager implements WifiAdapter {
  private connectedSsid: string | null = null;

  get current(): string | null {
    return this.connectedSsid;
  }

  /** Scanne les réseaux disponibles (simulé, avec un léger délai). */
  scan(): Promise<readonly WifiNetwork[]> {
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_NETWORKS), 700));
  }

  /**
   * Tente une connexion. Échoue si le réseau est sécurisé et le mot de passe fait
   * moins de 8 caractères (règle WPA courante) — pour tester le cas d'échec.
   */
  connect(network: WifiNetwork, password: string): Promise<WifiConnectResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (network.secured && password.length < 8) {
          resolve({ ok: false, reason: "Mot de passe trop court (8 caractères minimum)." });
          return;
        }
        this.connectedSsid = network.ssid;
        resolve({ ok: true });
      }, 900);
    });
  }
}
