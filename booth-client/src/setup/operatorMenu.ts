// Menu opérateur Kiosk (CIN-070) — couche modale par-dessus le parcours visiteur.
//
// Ce n'est PAS un écran de la state-machine du parcours : c'est une surface de service
// qui se superpose (z-index élevé) et se ferme sans perturber la séance en cours. On y
// entre par un geste caché (long appui dans un coin) — choix par défaut tant que les
// boutons physiques (F14) ne sont pas tranchés — ou, en dev, par Ctrl+Shift+O.
//
// L'entrée est gardée par une auth OFFLINE (PIN, cf. auth.ts) : le menu doit s'ouvrir
// Wi-Fi coupé. Wi-Fi/réglages/redémarrage réels = services locaux, différés (CIN-071/072) ;
// ici ce sont des hooks injectés (stubs en dev).

import { el } from "../ui/dom";
import { isHighContrast, setHighContrast } from "./accessibility";
import type { AccessJournal, AccessStore } from "./accessCache";
import { verifyOperator, type OperatorRole, type VerifyResult } from "./auth";
import type { WifiAdapter, WifiNetwork } from "./wifi";

export interface OperatorStatus {
  readonly boothId: string;
  readonly orgId: string;
  readonly version: string;
  readonly online: boolean;
}

/** Actions matériel/OS — stubs en dev, services locaux réels sur la Kiosk (CIN-071/072). */
export interface OperatorSettingsHooks {
  getVolume(): number;
  setVolume(pct: number): void;
  getBrightness(): number;
  setBrightness(pct: number): void;
  restart(): void;
}

export interface OperatorMenuDeps {
  readonly store: AccessStore;
  readonly journal: AccessJournal;
  readonly wifi: WifiAdapter;
  readonly settings: OperatorSettingsHooks;
  readonly status: () => OperatorStatus;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const INACTIVITY_MS = 90_000;
const PIN_MAX = 8;

const ROLE_LABEL: Record<OperatorRole, string> = {
  global_admin: "Admin global",
  super_user: "Administrateur",
  operator: "Opérateur",
};

type Tab = "wifi" | "settings" | "status";

export class OperatorMenu {
  private overlay: HTMLElement | null = null;
  private inactivityTimer: number | undefined;
  private lockoutTimer: number | undefined;

  private attempts = 0;
  private lockedUntil = 0;
  private pin = "";
  private session: { identifier: string; role: OperatorRole } | null = null;
  private tab: Tab = "wifi";

  constructor(private readonly deps: OperatorMenuDeps) {}

  /** Câble l'ouverture : hotspot caché (long appui 2,5 s) + raccourci clavier dev. */
  attachRevealGesture(host: HTMLElement): void {
    const hotspot = el("div", { class: "op-hotspot", "aria-hidden": "true" });
    let timer: number | undefined;
    const start = (): void => {
      timer = window.setTimeout(() => this.open(), 2500);
    };
    const cancel = (): void => {
      if (timer !== undefined) clearTimeout(timer);
    };
    hotspot.addEventListener("pointerdown", start);
    hotspot.addEventListener("pointerup", cancel);
    hotspot.addEventListener("pointerleave", cancel);
    host.append(hotspot);

    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "O" || e.key === "o")) {
        e.preventDefault();
        this.open();
      }
    });
  }

  open(): void {
    if (this.overlay) return; // déjà ouvert
    this.pin = "";
    this.session = null;
    this.overlay = el("div", { class: "op-overlay", role: "dialog", "aria-modal": "true" });
    this.overlay.addEventListener("pointerdown", () => this.bumpInactivity());
    document.body.append(this.overlay);
    this.renderGate();
    this.bumpInactivity();
  }

  close(): void {
    if (this.inactivityTimer !== undefined) clearTimeout(this.inactivityTimer);
    if (this.lockoutTimer !== undefined) clearTimeout(this.lockoutTimer);
    this.overlay?.remove();
    this.overlay = null;
    this.session = null;
    this.pin = "";
  }

  // ── Inactivité : ne jamais laisser le menu ouvert sur une Kiosk publique ────
  private bumpInactivity(): void {
    if (this.inactivityTimer !== undefined) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = window.setTimeout(() => this.close(), INACTIVITY_MS);
  }

  // ── Écran de garde (PIN) ─────────────────────────────────────────────────────
  private renderGate(): void {
    if (!this.overlay) return;
    const table = this.deps.store.load();

    const idInput = el("input", {
      class: "op-input",
      type: "text",
      inputmode: "text",
      autocomplete: "off",
      placeholder: "Identifiant (ex. PERCHOIR-CAB001-OP)",
      "aria-label": "Identifiant opérateur",
    }) as HTMLInputElement;

    const dots = el("div", { class: "op-pin-dots" });
    const message = el("p", { class: "op-msg", role: "alert" });
    const validateBtn = el("button", { class: "op-btn op-btn--primary", type: "button" }, ["Valider"]);

    const renderDots = (): void => {
      dots.replaceChildren(
        ...Array.from({ length: PIN_MAX }, (_, i) =>
          el("span", { class: i < this.pin.length ? "op-dot is-on" : "op-dot" }),
        ),
      );
    };

    const isLocked = (): boolean => Date.now() < this.lockedUntil;

    const refreshLock = (): void => {
      if (isLocked()) {
        const secs = Math.ceil((this.lockedUntil - Date.now()) / 1000);
        message.textContent = `Trop d'essais. Réessayez dans ${secs} s.`;
        validateBtn.setAttribute("disabled", "true");
        this.lockoutTimer = window.setTimeout(refreshLock, 1000);
      } else {
        validateBtn.removeAttribute("disabled");
      }
    };

    const pad = el("div", { class: "op-keypad" });
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
    for (const k of keys) {
      const key = el("button", { class: "op-key", type: "button" }, [k]);
      key.addEventListener("click", () => {
        this.bumpInactivity();
        if (k === "⌫") this.pin = this.pin.slice(0, -1);
        else if (k === "OK") {
          void submit();
          return;
        } else if (this.pin.length < PIN_MAX) this.pin += k;
        renderDots();
      });
      pad.append(key);
    }

    const submit = async (): Promise<void> => {
      if (isLocked()) return;
      const identifier = idInput.value;
      if (!table) {
        message.textContent = "Aucune table d'accès sur ce Kiosk. Contactez l'administrateur.";
        return;
      }
      if (identifier.trim() === "" || this.pin.length < 4) {
        message.textContent = "Saisissez un identifiant et un PIN (4 chiffres minimum).";
        return;
      }
      validateBtn.setAttribute("disabled", "true");
      message.textContent = "Vérification…";
      const result: VerifyResult = await verifyOperator(table, identifier, this.pin);
      validateBtn.removeAttribute("disabled");

      if (result.ok) {
        this.attempts = 0;
        this.session = { identifier: result.identifier, role: result.role };
        this.deps.journal.append({
          at: new Date().toISOString(),
          identifier: result.identifier,
          action: "login_ok",
        });
        this.renderPanel();
        return;
      }

      // Échec : on ne divulgue l'état (révoqué/expiré) que si le back nous l'a renvoyé
      // (donc PIN correct) — sinon message générique, pas d'énumération.
      this.pin = "";
      renderDots();
      this.attempts += 1;
      const remaining = MAX_ATTEMPTS - this.attempts;
      this.deps.journal.append({
        at: new Date().toISOString(),
        identifier: identifier.trim() || null,
        action: "login_fail",
        detail: result.reason,
      });
      if (result.reason === "revoked") message.textContent = "Accès révoqué. Contactez l'administrateur.";
      else if (result.reason === "expired") message.textContent = "Accès expiré. Contactez l'administrateur.";
      else if (remaining <= 0) {
        this.lockedUntil = Date.now() + LOCKOUT_MS;
        refreshLock();
        return;
      } else {
        message.textContent = `Identifiant ou PIN invalide. ${remaining} essai(s) restant(s).`;
      }
    };

    validateBtn.addEventListener("click", () => void submit());
    idInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });

    const staleWarn =
      table && Date.now() - Date.parse(table.updatedAt) > 30 * 24 * 3600_000
        ? el("p", { class: "op-hint op-hint--warn" }, [
            "Table d'accès non synchronisée depuis plus de 30 jours.",
          ])
        : null;

    const card = el("div", { class: "op-card op-card--gate" }, [
      el("h2", { class: "op-title" }, ["Menu opérateur"]),
      el("p", { class: "op-hint" }, ["Accès réservé. Authentifiez-vous pour continuer."]),
      idInput,
      dots,
      pad,
      message,
      el("div", { class: "op-actions" }, [
        el("button", { class: "op-btn op-btn--ghost", type: "button" }, ["Annuler"]),
        validateBtn,
      ]),
      ...(staleWarn ? [staleWarn] : []),
    ]);
    (card.querySelector(".op-btn--ghost") as HTMLButtonElement).addEventListener("click", () => this.close());

    renderDots();
    refreshLock();
    this.overlay.replaceChildren(card);
    idInput.focus();
  }

  // ── Panneau authentifié ──────────────────────────────────────────────────────
  private renderPanel(): void {
    if (!this.overlay || !this.session) return;

    const header = el("div", { class: "op-header" }, [
      el("div", { class: "op-who" }, [
        el("strong", {}, [this.session.identifier]),
        el("span", { class: "op-badge" }, [ROLE_LABEL[this.session.role]]),
      ]),
      el("button", { class: "op-btn op-btn--ghost", type: "button" }, ["Fermer"]),
    ]);
    (header.querySelector(".op-btn--ghost") as HTMLButtonElement).addEventListener("click", () => this.close());

    const tabs = el("div", { class: "op-tabs", role: "tablist" });
    const body = el("div", { class: "op-tabbody" });
    const defs: Array<{ id: Tab; label: string }> = [
      { id: "wifi", label: "Wi-Fi" },
      { id: "settings", label: "Réglages" },
      { id: "status", label: "État" },
    ];
    const renderTab = (): void => {
      tabs.querySelectorAll(".op-tab").forEach((t) => {
        t.classList.toggle("is-active", (t as HTMLElement).dataset.tab === this.tab);
      });
      if (this.tab === "wifi") body.replaceChildren(this.wifiTab());
      else if (this.tab === "settings") body.replaceChildren(this.settingsTab());
      else body.replaceChildren(this.statusTab());
    };
    for (const d of defs) {
      const t = el("button", { class: "op-tab", type: "button", role: "tab", "data-tab": d.id }, [d.label]);
      t.addEventListener("click", () => {
        this.tab = d.id;
        renderTab();
      });
      tabs.append(t);
    }

    const card = el("div", { class: "op-card op-card--panel" }, [header, tabs, body]);
    renderTab();
    this.overlay.replaceChildren(card);
  }

  // ── Onglet Wi-Fi ─────────────────────────────────────────────────────────────
  private wifiTab(): HTMLElement {
    const list = el("div", { class: "op-wifi-list" }, [el("p", { class: "op-hint" }, ["Aucun scan effectué."])]);
    const feedback = el("p", { class: "op-msg", role: "alert" });
    const scanBtn = el("button", { class: "op-btn op-btn--primary", type: "button" }, ["Scanner les réseaux"]);
    const current = this.deps.wifi.current;
    const currentLine = el("p", { class: "op-hint" }, [
      current ? `Connecté : ${current}` : "Non connecté au Wi-Fi.",
    ]);

    const renderNetworks = (networks: readonly WifiNetwork[]): void => {
      list.replaceChildren(
        ...networks.map((n) => {
          const row = el("button", { class: "op-wifi-row", type: "button" }, [
            el("span", { class: "op-wifi-ssid" }, [n.secured ? `🔒 ${n.ssid}` : n.ssid]),
            el("span", { class: "op-wifi-signal" }, [`${n.signalPct}%`]),
          ]);
          row.addEventListener("click", () => this.connectFlow(n, list, feedback, renderNetworks, networks));
          return row;
        }),
      );
    };

    scanBtn.addEventListener("click", async () => {
      this.bumpInactivity();
      scanBtn.setAttribute("disabled", "true");
      feedback.textContent = "";
      list.replaceChildren(el("p", { class: "op-hint" }, ["Scan en cours…"]));
      const networks = await this.deps.wifi.scan();
      renderNetworks(networks);
      scanBtn.removeAttribute("disabled");
    });

    return el("div", {}, [currentLine, scanBtn, list, feedback]);
  }

  private connectFlow(
    network: WifiNetwork,
    list: HTMLElement,
    feedback: HTMLElement,
    rerender: (n: readonly WifiNetwork[]) => void,
    all: readonly WifiNetwork[],
  ): void {
    this.bumpInactivity();
    if (!network.secured) {
      void this.doConnect(network, "", feedback, rerender, all);
      return;
    }
    const pwd = el("input", {
      class: "op-input",
      type: "password",
      autocomplete: "off",
      placeholder: `Mot de passe pour ${network.ssid}`,
      "aria-label": "Mot de passe Wi-Fi",
    }) as HTMLInputElement;
    const go = el("button", { class: "op-btn op-btn--primary", type: "button" }, ["Se connecter"]);
    const back = el("button", { class: "op-btn op-btn--ghost", type: "button" }, ["Retour"]);
    go.addEventListener("click", () => void this.doConnect(network, pwd.value, feedback, rerender, all));
    pwd.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.doConnect(network, pwd.value, feedback, rerender, all);
    });
    back.addEventListener("click", () => rerender(all));
    list.replaceChildren(
      el("div", { class: "op-wifi-connect" }, [
        el("p", { class: "op-hint" }, [`Réseau sécurisé : ${network.ssid}`]),
        pwd,
        el("div", { class: "op-actions" }, [back, go]),
      ]),
    );
    pwd.focus();
  }

  private async doConnect(
    network: WifiNetwork,
    password: string,
    feedback: HTMLElement,
    rerender: (n: readonly WifiNetwork[]) => void,
    all: readonly WifiNetwork[],
  ): Promise<void> {
    feedback.textContent = `Connexion à ${network.ssid}…`;
    const res = await this.deps.wifi.connect(network, password);
    this.deps.journal.append({
      at: new Date().toISOString(),
      identifier: this.session?.identifier ?? null,
      action: "wifi_connect",
      detail: res.ok ? `ok:${network.ssid}` : `fail:${network.ssid}`,
    });
    if (res.ok) {
      feedback.textContent = `Connecté à ${network.ssid}.`;
      rerender(all);
    } else {
      feedback.textContent = res.reason ?? "Échec de la connexion.";
    }
  }

  // ── Onglet Réglages ──────────────────────────────────────────────────────────
  private settingsTab(): HTMLElement {
    const slider = (label: string, get: () => number, set: (v: number) => void): HTMLElement => {
      const value = el("span", { class: "op-slider-val" }, [`${get()}%`]);
      const input = el("input", {
        class: "op-slider",
        type: "range",
        min: "0",
        max: "100",
        step: "5",
        value: String(get()),
      }) as HTMLInputElement;
      input.addEventListener("input", () => {
        this.bumpInactivity();
        const v = Number(input.value);
        set(v);
        value.textContent = `${v}%`;
      });
      return el("div", { class: "op-field" }, [
        el("label", { class: "op-label" }, [label, value]),
        input,
      ]);
    };

    const restartBtn = el("button", { class: "op-btn op-btn--danger", type: "button" }, ["Redémarrer le Kiosk"]);
    const confirmSlot = el("div", { class: "op-confirm" });
    restartBtn.addEventListener("click", () => {
      this.bumpInactivity();
      const yes = el("button", { class: "op-btn op-btn--danger", type: "button" }, ["Confirmer le redémarrage"]);
      const no = el("button", { class: "op-btn op-btn--ghost", type: "button" }, ["Annuler"]);
      yes.addEventListener("click", () => {
        this.deps.journal.append({
          at: new Date().toISOString(),
          identifier: this.session?.identifier ?? null,
          action: "restart",
        });
        this.deps.settings.restart();
        confirmSlot.replaceChildren(el("p", { class: "op-hint" }, ["Redémarrage demandé…"]));
      });
      no.addEventListener("click", () => confirmSlot.replaceChildren());
      confirmSlot.replaceChildren(
        el("p", { class: "op-hint op-hint--warn" }, ["Le parcours en cours sera interrompu. Confirmer ?"]),
        el("div", { class: "op-actions" }, [no, yes]),
      );
    });

    // Accessibilité : mode haute visibilité (F13). Réglage du LIEU, mémorisé, appliqué à toute
    // l'app (contrastes renforcés + focus élargi). Interrupteur explicite, pas un slider.
    const hvBtn = el("button", { class: "op-btn", type: "button" }, []) as HTMLButtonElement;
    const syncHv = (): void => {
      const on = isHighContrast();
      hvBtn.textContent = on ? "Activée" : "Désactivée";
      hvBtn.classList.toggle("op-btn--primary", on);
      hvBtn.setAttribute("aria-pressed", on ? "true" : "false");
    };
    hvBtn.addEventListener("click", () => {
      this.bumpInactivity();
      setHighContrast(!isHighContrast());
      syncHv();
    });
    syncHv();
    const highContrast = el("div", { class: "op-field" }, [
      el("label", { class: "op-label" }, ["Haute visibilité", el("span", { class: "op-slider-val" }, ["contraste renforcé"])]),
      hvBtn,
    ]);

    return el("div", {}, [
      slider("Volume", () => this.deps.settings.getVolume(), (v) => this.deps.settings.setVolume(v)),
      slider("Luminosité", () => this.deps.settings.getBrightness(), (v) => this.deps.settings.setBrightness(v)),
      highContrast,
      el("hr", { class: "op-sep" }),
      restartBtn,
      confirmSlot,
    ]);
  }

  // ── Onglet État ──────────────────────────────────────────────────────────────
  private statusTab(): HTMLElement {
    const s = this.deps.status();
    const table = this.deps.store.load();
    const row = (k: string, v: string): HTMLElement =>
      el("div", { class: "op-status-row" }, [el("span", { class: "op-status-k" }, [k]), el("span", {}, [v])]);
    const onlineBadge = el("span", { class: s.online ? "op-badge is-online" : "op-badge is-offline" }, [
      s.online ? "En ligne" : "Hors ligne",
    ]);
    return el("div", { class: "op-status" }, [
      el("div", { class: "op-status-row" }, [el("span", { class: "op-status-k" }, ["Connexion"]), onlineBadge]),
      row("Kiosk", s.boothId),
      row("Organisation", s.orgId),
      row("Version logicielle", s.version),
      row("Wi-Fi", this.deps.wifi.current ?? "—"),
      row("Table d'accès", table ? `${table.entries.length} accès · maj ${new Date(table.updatedAt).toLocaleString("fr-FR")}` : "absente"),
    ]);
  }
}
