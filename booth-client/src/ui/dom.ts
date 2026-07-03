import QRCode from "qrcode";

// Petits helpers DOM — vanilla, typés, sans framework.

type Attrs = Record<string, string | number | boolean | undefined>;

/** Crée un élément typé avec attributs et enfants. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** Formate une durée en secondes → "8 min" / "1 h 05". */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Rend un QR code (data URL PNG) pour une valeur donnée. */
export async function renderQrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

/** Formate un nombre de secondes en horloge "0:47". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface Countdown {
  readonly node: HTMLElement;
  readonly dispose: () => void;
}

/**
 * Compte à rebours visible. Barre qui se vide + horloge. Passe en état "urgent"
 * (classe `is-urgent`) sous 10 s. Appelle `onExpire` une seule fois à 0.
 */
export function createCountdown(totalSeconds: number, onExpire: () => void): Countdown {
  const label = el("span", { class: "countdown__label" }, ["Retour automatique dans"]);
  const clock = el("span", { class: "countdown__clock" }, [formatClock(totalSeconds)]);
  const fill = el("div", { class: "countdown__fill" }, []);
  const track = el("div", { class: "countdown__track" }, [fill]);
  const node = el("div", { class: "countdown", role: "timer" }, [
    el("div", { class: "countdown__row" }, [label, clock]),
    track,
  ]);

  const startedAt = performance.now();
  const totalMs = totalSeconds * 1000;
  let fired = false;
  let raf = 0;

  const tick = (): void => {
    const elapsed = performance.now() - startedAt;
    const remainingMs = Math.max(0, totalMs - elapsed);
    const remainingS = remainingMs / 1000;
    fill.style.width = `${(remainingMs / totalMs) * 100}%`;
    clock.textContent = formatClock(remainingS);
    node.classList.toggle("is-urgent", remainingS <= 10);
    if (remainingMs <= 0) {
      if (!fired) {
        fired = true;
        onExpire();
      }
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    node,
    dispose: () => {
      fired = true; // empêche onExpire après démontage
      cancelAnimationFrame(raf);
    },
  };
}
