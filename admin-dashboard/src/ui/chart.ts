import { el } from "./dom";

// Graphe temporel SVG minimal, sans dépendance. Une seule série, une seule
// échelle (jamais de double axe — règle n°1 dataviz). Traits fins, grille
// discrète, survol crosshair + infobulle, couleurs via variables Tabler
// (fonctionne en clair comme en sombre).

export interface ChartPoint {
  readonly date: string; // "YYYY-MM-DD"
  readonly value: number;
}

export interface ChartOptions {
  readonly title: string;
  readonly points: readonly ChartPoint[];
  readonly kind: "area" | "line";
  /** Couleur de la série (ex. "var(--tblr-primary)"). */
  readonly hue: string;
  /** Formatage de la valeur pour l'infobulle. */
  readonly formatValue: (n: number) => string;
}

const W = 640;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 24, left: 40 };

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function timeSeriesChart(opts: ChartOptions): HTMLElement {
  const pts = opts.points;
  const n = pts.length;
  // Sans point (borne neuve, aucun historique), les libellés d'axe lisent pts[0].date →
  // crash. On rend un état vide propre au lieu de planter le tiroir / le hub cabine.
  if (n === 0) {
    return el("div", { class: "text-secondary small text-center py-4" }, [opts.title ? `${opts.title} — pas encore de données` : "Pas encore de données"]);
  }
  const maxV = Math.max(1, ...pts.map((p) => p.value));

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number): number => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number): number => PAD.top + plotH - (v / maxV) * plotH;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("ts-chart");

  const mk = (tag: string, attrs: Record<string, string>): SVGElement => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const label = (attrs: Record<string, string>, text: string): void => {
    const t = mk("text", attrs);
    t.textContent = text;
    svg.append(t);
  };
  // Grille horizontale discrète (0, mid, max) + libellés Y.
  for (const frac of [0, 0.5, 1]) {
    const gy = PAD.top + plotH - frac * plotH;
    svg.append(mk("line", { x1: String(PAD.left), y1: String(gy), x2: String(W - PAD.right), y2: String(gy), class: "ts-grid" }));
    label({ x: String(PAD.left - 6), y: String(gy + 4), class: "ts-axis", "text-anchor": "end" }, opts.formatValue(Math.round(frac * maxV)));
  }
  // Libellés X : premier, milieu, dernier.
  for (const i of [0, Math.floor((n - 1) / 2), n - 1]) {
    label({ x: String(x(i)), y: String(H - 6), class: "ts-axis", "text-anchor": "middle" }, shortDate(pts[i]!.date));
  }

  if (opts.kind === "area") {
    svg.append(mk("path", { d: area, class: "ts-area", style: `fill:${opts.hue}` }));
  }
  svg.append(mk("path", { d: line, class: "ts-line", style: `stroke:${opts.hue}` }));

  // Couche de survol : crosshair + point + infobulle.
  const cross = mk("line", { class: "ts-cross", y1: String(PAD.top), y2: String(PAD.top + plotH), style: "display:none" });
  const dot = mk("circle", { class: "ts-dot", r: "4", style: `fill:${opts.hue};display:none` });
  svg.append(cross, dot);

  const tooltip = el("div", { class: "ts-tooltip" }, []);
  const wrap = el("div", { class: "ts-wrap" }, [
    el("div", { class: "ts-title" }, [opts.title]),
    svg,
    tooltip,
  ]);

  const onMove = (evt: PointerEvent): void => {
    const rect = svg.getBoundingClientRect();
    const ratio = (evt.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    const px = x(i);
    const py = y(pts[i]!.value);
    cross.setAttribute("x1", String(px));
    cross.setAttribute("x2", String(px));
    cross.setAttribute("style", "");
    dot.setAttribute("cx", String(px));
    dot.setAttribute("cy", String(py));
    dot.setAttribute("style", `fill:${opts.hue}`);
    tooltip.textContent = `${shortDate(pts[i]!.date)} · ${opts.formatValue(pts[i]!.value)}`;
    tooltip.style.left = `${(px / W) * 100}%`;
    tooltip.classList.add("is-visible");
  };
  const onLeave = (): void => {
    cross.setAttribute("style", "display:none");
    dot.setAttribute("style", "display:none");
    tooltip.classList.remove("is-visible");
  };
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", onLeave);

  return wrap;
}
