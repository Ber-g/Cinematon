import type { Film, Play } from "../domain/types";
import type { UnlockStatus } from "../unlock/UnlockAdapter";
import { el, formatDuration, renderQrDataUrl } from "./dom";

// Chaque écran renvoie un noeud + une fonction de nettoyage optionnelle (timers,
// vidéo…). Un seul écran est monté à la fois par App.
export interface ScreenResult {
  readonly node: HTMLElement;
  readonly dispose?: () => void;
}

const screen = (name: string, children: Array<Node | string>): HTMLElement =>
  el("section", { class: `screen screen--${name}` }, children);

// ── Écran d'accueil (idle / attract loop) ───────────────────────────────────
export function idleScreen(onStart: () => void): ScreenResult {
  const start = el("button", { class: "btn btn--primary btn--xl", type: "button" }, [
    "Toucher pour commencer",
  ]);
  start.addEventListener("click", onStart);
  return {
    node: screen("idle", [
      el("div", { class: "brand" }, [
        el("h1", { class: "brand__title" }, ["CINEMATON"]),
        el("p", { class: "brand__tagline" }, ["Votre séance de cinéma, rien qu'à vous."]),
      ]),
      start,
    ]),
  };
}

// ── Déverrouillage en cours ──────────────────────────────────────────────────
export function unlockingScreen(onCancel: () => void): ScreenResult {
  const cancel = el("button", { class: "btn btn--ghost", type: "button" }, ["Annuler"]);
  cancel.addEventListener("click", onCancel);
  return {
    node: screen("unlocking", [
      el("div", { class: "spinner", "aria-hidden": "true" }, []),
      el("h2", {}, ["Déverrouillage de votre séance…"]),
      el("p", { class: "muted" }, ["Suivez les instructions à l'écran."]),
      cancel,
    ]),
  };
}

// ── Repli après échec de déverrouillage (jamais d'écran technique) ───────────
export function unlockFallbackScreen(status: UnlockStatus, onRetry: () => void): ScreenResult {
  // Copie non-technique, actionnable, adaptée à chaque cas.
  const messages: Record<Exclude<UnlockStatus, "success">, { title: string; body: string }> = {
    refused: {
      title: "Le déverrouillage n'a pas abouti",
      body: "Aucun montant n'a été prélevé. Vous pouvez réessayer quand vous voulez.",
    },
    timeout: {
      title: "Un peu trop long…",
      body: "La séance ne s'est pas déverrouillée à temps. On réessaie ?",
    },
    abandoned: {
      title: "Séance annulée",
      body: "Pas de souci — revenez quand vous êtes prêt·e.",
    },
  };
  const m = messages[status as Exclude<UnlockStatus, "success">] ?? messages.refused;
  const retry = el("button", { class: "btn btn--primary", type: "button" }, ["Réessayer"]);
  retry.addEventListener("click", onRetry);
  return {
    node: screen("fallback", [
      el("h2", {}, [m.title]),
      el("p", { class: "muted" }, [m.body]),
      retry,
    ]),
  };
}

// ── Sélection par humeur / durée ─────────────────────────────────────────────
export interface SelectChoice {
  readonly mood: string | null;
  readonly maxDurationSeconds: number | null;
}

export function selectScreen(
  moods: readonly string[],
  onChoose: (choice: SelectChoice) => void,
): ScreenResult {
  let mood: string | null = null;
  let maxDuration: number | null = null;

  const moodButtons = moods.map((m) => {
    const b = el("button", { class: "chip", type: "button", "data-mood": m }, [m]);
    b.addEventListener("click", () => {
      mood = mood === m ? null : m;
      for (const other of moodButtons) other.classList.toggle("chip--on", other === b && mood === m);
    });
    return b;
  });

  const durations: Array<{ label: string; value: number | null }> = [
    { label: "Court (< 5 min)", value: 300 },
    { label: "Moyen (< 10 min)", value: 600 },
    { label: "Peu importe", value: null },
  ];
  let durationButtons: HTMLButtonElement[] = [];
  durationButtons = durations.map((d) => {
    const b = el("button", { class: "chip", type: "button" }, [d.label]);
    b.addEventListener("click", () => {
      maxDuration = d.value;
      for (const other of durationButtons) other.classList.toggle("chip--on", other === b);
    });
    return b;
  });

  const go = el("button", { class: "btn btn--primary btn--lg", type: "button" }, [
    "Voir les suggestions",
  ]);
  go.addEventListener("click", () => onChoose({ mood, maxDurationSeconds: maxDuration }));

  return {
    node: screen("select", [
      el("h2", {}, ["Quelle humeur, ce soir ?"]),
      el("p", { class: "muted" }, ["Choisissez une ambiance et une durée — ou laissez-vous guider."]),
      el("div", { class: "group" }, [
        el("h3", { class: "group__label" }, ["Ambiance"]),
        el("div", { class: "chips" }, moodButtons),
      ]),
      el("div", { class: "group" }, [
        el("h3", { class: "group__label" }, ["Durée"]),
        el("div", { class: "chips" }, durationButtons),
      ]),
      go,
    ]),
  };
}

// ── Recommandation : proposition principale + alternatives ───────────────────
export interface RecoCallbacks {
  readonly onPlayRecommended: (film: Film) => void;
  readonly onPlayChosen: (film: Film) => void;
  readonly onNoneEndSession: () => void;
}

export function recoScreen(recommended: readonly Film[], cb: RecoCallbacks): ScreenResult {
  if (recommended.length === 0) {
    const end = el("button", { class: "btn btn--primary", type: "button" }, ["Terminer la séance"]);
    end.addEventListener("click", cb.onNoneEndSession);
    return {
      node: screen("reco", [
        el("h2", {}, ["Vous avez fait le tour !"]),
        el("p", { class: "muted" }, ["Plus de film à proposer pour ces critères."]),
        end,
      ]),
    };
  }

  const [top, ...rest] = recommended;
  const playTop = el("button", { class: "btn btn--primary btn--lg", type: "button" }, ["Lancer ce film"]);
  playTop.addEventListener("click", () => cb.onPlayRecommended(top!));

  const restCards = rest.slice(0, 3).map((f) => {
    const card = el("button", { class: "filmcard", type: "button" }, [
      el("span", { class: "filmcard__title" }, [f.title]),
      el("span", { class: "filmcard__meta" }, [`${formatDuration(f.durationSeconds)} · ${f.genres.join(", ")}`]),
    ]);
    card.addEventListener("click", () => cb.onPlayChosen(f));
    return card;
  });

  return {
    node: screen("reco", [
      el("p", { class: "eyebrow" }, ["On vous propose"]),
      el("div", { class: "hero" }, [
        el("h2", { class: "hero__title" }, [top!.title]),
        el("p", { class: "hero__meta" }, [
          `${top!.year} · ${formatDuration(top!.durationSeconds)} · ${top!.moods.join(", ")}`,
        ]),
      ]),
      playTop,
      rest.length > 0
        ? el("div", { class: "group" }, [
            el("h3", { class: "group__label" }, ["Ou plutôt…"]),
            el("div", { class: "filmcards" }, restCards),
          ])
        : el("span", {}, []),
    ]),
  };
}

// ── Lecture (réelle si storageUrl, sinon simulée) ────────────────────────────
export function playerScreen(film: Film, onFinished: () => void): ScreenResult {
  const title = el("div", { class: "player__title" }, [film.title]);
  const bar = el("div", { class: "progress__bar" }, []);
  const progress = el("div", { class: "progress" }, [bar]);
  const skip = el("button", { class: "btn btn--ghost btn--corner", type: "button" }, ["Passer (démo)"]);

  let disposed = false;
  const finishOnce = () => {
    if (disposed) return;
    disposed = true;
    onFinished();
  };
  skip.addEventListener("click", finishOnce);

  let intervalId: number | undefined;
  let videoEl: HTMLVideoElement | undefined;

  if (film.storageUrl) {
    // Lecture réelle.
    videoEl = el("video", { class: "player__video", src: film.storageUrl, autoplay: true, playsinline: true });
    videoEl.addEventListener("ended", finishOnce);
    videoEl.addEventListener("error", finishOnce); // jamais bloquer sur un fichier absent/corrompu
  } else {
    // Lecture SIMULÉE : progression accélérée (~12 s) pour tester le parcours.
    const SIM_MS = 12000;
    const started = performance.now();
    intervalId = window.setInterval(() => {
      const ratio = Math.min(1, (performance.now() - started) / SIM_MS);
      bar.style.width = `${ratio * 100}%`;
      if (ratio >= 1) finishOnce();
    }, 100);
  }

  const badge = film.storageUrl
    ? el("span", {}, [])
    : el("span", { class: "sim-badge" }, ["DÉMO · lecture simulée"]);

  const node = screen("player", [
    videoEl ?? el("div", { class: "player__stage" }, [badge, title, el("p", { class: "muted" }, [
      `${formatDuration(film.durationSeconds)} · ${film.year}`,
    ])]),
    progress,
    skip,
  ]);

  return {
    node,
    dispose: () => {
      disposed = true;
      if (intervalId !== undefined) clearInterval(intervalId);
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute("src");
      }
    },
  };
}

// ── Entre deux films ─────────────────────────────────────────────────────────
export function interScreen(watchedCount: number, onAnother: () => void, onEnd: () => void): ScreenResult {
  const another = el("button", { class: "btn btn--primary btn--lg", type: "button" }, ["Encore un film"]);
  another.addEventListener("click", onAnother);
  const end = el("button", { class: "btn btn--ghost", type: "button" }, ["Terminer la séance"]);
  end.addEventListener("click", onEnd);
  return {
    node: screen("inter", [
      el("h2", {}, [watchedCount === 1 ? "Un film de vu." : `${watchedCount} films de vus.`]),
      el("p", { class: "muted" }, ["Envie de continuer, ou de garder ça pour vous ?"]),
      el("div", { class: "actions" }, [another, end]),
    ]),
  };
}

// ── Fin de séance : récap + QR de partage ────────────────────────────────────
export function endScreen(
  plays: readonly Play[],
  filmLookup: (id: string) => Film | undefined,
  shareUrl: string,
  onDone: () => void,
): ScreenResult {
  const recapItems = plays.map((p, i) => {
    const f = filmLookup(p.filmId);
    return el("li", { class: "recap__item" }, [
      el("span", { class: "recap__index" }, [String(i + 1)]),
      el("span", { class: "recap__title" }, [f ? `${f.title} (${f.year})` : p.filmId]),
      p.source === "recommendation" ? el("span", { class: "recap__tag" }, ["suggéré"]) : el("span", {}, []),
    ]);
  });

  const qrImg = el("img", { class: "qr", alt: "QR code vers votre séance", width: 220, height: 220 });
  void renderQrDataUrl(shareUrl).then((dataUrl) => {
    qrImg.src = dataUrl;
  });

  const done = el("button", { class: "btn btn--primary", type: "button" }, ["Terminer"]);
  done.addEventListener("click", onDone);

  return {
    node: screen("end", [
      el("h2", {}, ["Votre séance"]),
      el("ol", { class: "recap" }, recapItems),
      el("div", { class: "share" }, [
        qrImg,
        el("p", { class: "muted" }, ["Scannez pour retrouver et partager votre séance."]),
        el("p", { class: "fineprint" }, ["Lien public et temporaire — aucune donnée personnelle."]),
      ]),
      done,
    ]),
  };
}
