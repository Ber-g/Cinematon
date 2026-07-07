// Sous-titres — utilitaires purs (parse / décalage / sérialisation VTT).
// Tolère l'entrée SRT (virgule décimale) ET VTT (point décimal). Testable sans DOM.

export interface Cue {
  /** Début en secondes. */
  readonly start: number;
  /** Fin en secondes. */
  readonly end: number;
  readonly text: string;
}

/** "00:01:02,500" | "00:01:02.500" | "01:02.500" → secondes. NaN si invalide. */
function parseTimestamp(raw: string): number {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return NaN;
  const [, hh, mm, ss, ms] = m;
  const h = hh ? Number(hh) : 0;
  return h * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

/** Secondes → "HH:MM:SS.mmm" (format VTT). */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, l = 2): string => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;
}

/**
 * Parse un contenu SRT ou VTT en liste de cues. Robuste : ignore l'en-tête WEBVTT,
 * les numéros de bloc SRT, les blocs sans timing. Une cue = un bloc contenant une
 * ligne « start --> end ».
 */
export function parseSubtitles(content: string): Cue[] {
  const normalized = content.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const blocks = normalized.split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const arrowIdx = lines.findIndex((l) => l.includes("-->"));
    if (arrowIdx === -1) continue;
    const times = lines[arrowIdx].split("-->");
    if (times.length < 2) continue;
    const start = parseTimestamp(times[0]);
    // La fin peut être suivie de réglages de position VTT (« align:… ») → on coupe.
    const end = parseTimestamp(times[1].trim().split(/\s+/)[0]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const text = lines.slice(arrowIdx + 1).join("\n").trim();
    if (text === "") continue;
    cues.push({ start, end, text });
  }
  return cues;
}

/** Applique un décalage (secondes, ±) à toutes les cues. Borne à 0, jette celles devenues vides. */
export function shiftCues(cues: readonly Cue[], offsetSeconds: number): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const start = Math.max(0, c.start + offsetSeconds);
    const end = Math.max(0, c.end + offsetSeconds);
    if (end > start) out.push({ start, end, text: c.text });
  }
  return out;
}

/** Sérialise des cues en VTT (avec décalage optionnel baké dans les timings). */
export function cuesToVtt(cues: readonly Cue[], offsetSeconds = 0): string {
  const shifted = offsetSeconds === 0 ? [...cues] : shiftCues(cues, offsetSeconds);
  const body = shifted
    .map((c) => `${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
