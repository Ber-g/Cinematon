// Client de l'agent local de la borne (CIN-071, câblage booth-client → agent).
//
// Le menu opérateur pilotait des STUBS ; sur la Kiosk réelle il appelle l'agent local
// (127.0.0.1, cf. kiosk/agent/agent.mjs) qui exécute nmcli/systemctl/amixer/backlight.
//
// ⚠️ Le jeton de l'agent NE DOIT PAS être embarqué dans le bundle (sinon un contenu web
// compromis obtiendrait le privilège système — principe F17). Il est fourni AU RUNTIME
// par la couche de service locale de la borne via `/kiosk-config.json` (lu par la borne,
// hors bundle). Absent (dev navigateur) → `loadKioskConfig()` renvoie null → on retombe
// sur les stubs (WifiManager mock + réglages locaux).

import type { WifiAdapter, WifiConnectResult, WifiNetwork } from "./wifi";
import type { OperatorSettingsHooks } from "./operatorMenu";

/** Identifiants Supabase du device — fournis AU RUNTIME, jamais compilés dans le bundle. */
export interface KioskDeviceConfig {
  readonly boothId: string;
  readonly orgId: string;
  readonly deviceEmail: string;
  readonly devicePassword: string;
}

export interface KioskConfig {
  readonly agentUrl: string;
  readonly agentToken: string;
  /** Creds device, servis localement par la borne. Absent = build public inerte (mock). */
  readonly device?: KioskDeviceConfig;
}

function parseDevice(d: unknown): KioskDeviceConfig | undefined {
  if (!d || typeof d !== "object") return undefined;
  const o = d as Record<string, unknown>;
  const ok = ["boothId", "orgId", "deviceEmail", "devicePassword"].every((k) => typeof o[k] === "string" && o[k] !== "");
  return ok
    ? { boothId: String(o.boothId), orgId: String(o.orgId), deviceEmail: String(o.deviceEmail), devicePassword: String(o.devicePassword) }
    : undefined;
}

/** Charge la config locale de la borne (jeton + creds device, hors bundle). null = pas de borne (dev). */
export async function loadKioskConfig(): Promise<KioskConfig | null> {
  try {
    const res = await fetch("/kiosk-config.json", { cache: "no-store" });
    if (!res.ok) return null;
    const cfg = (await res.json()) as Partial<KioskConfig>;
    if (typeof cfg.agentUrl === "string" && typeof cfg.agentToken === "string") {
      const device = parseDevice(cfg.device);
      return { agentUrl: cfg.agentUrl, agentToken: cfg.agentToken, ...(device ? { device } : {}) };
    }
    return null;
  } catch {
    return null;
  }
}

/** Appelle l'agent local avec le jeton Bearer. Lève en cas d'erreur réseau/HTTP. */
export class KioskAgentClient {
  constructor(private readonly cfg: KioskConfig) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.cfg.agentToken}` };
    const init: RequestInit = { method, headers };
    if (method === "POST") {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body ?? {});
    }
    const res = await fetch(`${this.cfg.agentUrl}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) ?? `agent ${res.status}`);
    return data as T;
  }

  wifiScan(): Promise<{ networks: WifiNetwork[] }> {
    return this.call("POST", "/wifi/scan");
  }
  wifiConnect(ssid: string, password: string): Promise<{ ok: boolean }> {
    return this.call("POST", "/wifi/connect", { ssid, password });
  }
  setBrightness(pct: number): Promise<unknown> {
    return this.call("POST", "/display/brightness", { pct });
  }
  setVolume(pct: number): Promise<unknown> {
    return this.call("POST", "/audio/volume", { pct });
  }
  restart(): Promise<unknown> {
    return this.call("POST", "/power/restart");
  }
  /** MAJ OS (apt) — CIN-077. Renvoie la queue de sortie + le nb de paquets restants. */
  osUpdate(): Promise<{ ok: boolean; log?: string; pending?: number }> {
    return this.call("POST", "/system/os-update");
  }
  /** Nombre de paquets système en attente (sans rien appliquer). */
  osUpdateStatus(): Promise<{ pending: number }> {
    return this.call("GET", "/system/os-update/status");
  }
}

/** Adaptateur Wi-Fi réel (agent) — même contrat que le mock `WifiManager`. */
export class AgentWifiAdapter implements WifiAdapter {
  private connectedSsid: string | null = null;

  constructor(private readonly client: KioskAgentClient) {}

  get current(): string | null {
    return this.connectedSsid;
  }

  async scan(): Promise<readonly WifiNetwork[]> {
    const { networks } = await this.client.wifiScan();
    return networks;
  }

  async connect(network: WifiNetwork, password: string): Promise<WifiConnectResult> {
    try {
      await this.client.wifiConnect(network.ssid, password);
      this.connectedSsid = network.ssid;
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "Échec de la connexion." };
    }
  }
}

/**
 * Réglages réels (agent). L'interface `OperatorSettingsHooks` est synchrone (le menu lit
 * la valeur pour l'afficher) : on garde une valeur en cache (défaut) et on pousse le
 * changement à l'agent en arrière-plan — l'opérateur règle en relatif.
 */
export function createAgentSettings(
  client: KioskAgentClient,
  defaults: { volume: number; brightness: number } = { volume: 70, brightness: 100 },
): OperatorSettingsHooks {
  let volume = defaults.volume;
  let brightness = defaults.brightness;
  return {
    getVolume: () => volume,
    setVolume: (v) => {
      volume = v;
      void client.setVolume(v).catch((e) => console.error("[kiosk] volume :", e));
    },
    getBrightness: () => brightness,
    setBrightness: (v) => {
      brightness = v;
      void client.setBrightness(v).catch((e) => console.error("[kiosk] luminosité :", e));
    },
    restart: () => {
      void client.restart().catch((e) => console.error("[kiosk] redémarrage :", e));
    },
  };
}
