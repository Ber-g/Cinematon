// Onglet « Mes styles » (F19, volet dashboard) — une org (super_user) définit le style de ses
// cabines : 7 couleurs, 3 fontes, 1 titre. Aperçu live d'un écran cabine + contrôle de contraste
// automatique (WCAG). Réinitialisation au style maître Kioskoscope (super_user de l'org ou
// global_admin). Le type `OrgStyle` et les helpers de contraste viennent de @kioskoscope/domain
// (source UNIQUE cabine + dashboard — on ne les redéfinit jamais ici).
//
// Précédence de rendu côté cabine (rappel) : maître Kioskoscope < style d'org (défini ici) <
// humeur runtime. Un slot laissé vide retombe sur le maître. La mention « propulsé par
// Kioskoscope » est NON supprimable dans l'aperçu — elle l'est aussi côté cabine.

import { contrastRatio, parseHexColor, readableInk } from "@kioskoscope/domain";
import type { OrgStyle, OrgStyleFonts, OrgStylePalette } from "@kioskoscope/domain";
import type { FleetStore, OrgSummary } from "../data/store";
import { el, icon } from "./dom";

/** Brouillons éditables (mutables, cordes) alignés sur la forme figée du domaine. */
type PaletteDraft = { -readonly [K in keyof OrgStylePalette]?: string };
type FontsDraft = { -readonly [K in keyof OrgStyleFonts]?: string };

// Valeurs du style MAÎTRE Kioskoscope (miroir des tokens cabine, thème sombre). Servent de
// repli pour l'aperçu et de placeholder « héritée » des champs. Une modification du maître
// côté cabine devra être reflétée ici (constante volontairement locale au dashboard).
const MASTER_PALETTE: OrgStylePalette = {
  bg: "#0a0a0c",
  surface: "#17171b",
  surfaceRaised: "#202027",
  accent: "#e8b45a",
  accent2: "#8ecbff",
  text: "#f4f2ee",
  textEmphasis: "#ffffff",
};
const MASTER_FONTS: OrgStyleFonts = {
  display: '"Georgia", "Iowan Old Style", "Times New Roman", serif',
  body: '"Georgia", "Iowan Old Style", "Times New Roman", serif',
  ui: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
const MASTER_TITLE = "Kioskoscope";

const COLOR_SLOTS: ReadonlyArray<{ key: keyof OrgStylePalette; label: string; hint: string }> = [
  { key: "bg", label: "Fond", hint: "Fond profond de la salle (dominante 1)." },
  { key: "surface", label: "Surface", hint: "Cartes et panneaux (dominante 2)." },
  { key: "surfaceRaised", label: "Surface surélevée", hint: "Boutons neutres, éléments actifs (dominante 3)." },
  { key: "accent", label: "Accent chaud", hint: "Actions et sélection (ambre projecteur par défaut)." },
  { key: "accent2", label: "Accent froid", hint: "Focus et lueur d'écran (cyan CRT par défaut)." },
  { key: "text", label: "Texte", hint: "Corps de texte courant." },
  { key: "textEmphasis", label: "Texte accentué", hint: "Titres et chiffres mis en valeur." },
];

const FONT_ROLES: ReadonlyArray<{ key: keyof OrgStyleFonts; label: string; hint: string }> = [
  { key: "display", label: "Titrage", hint: "Pile CSS font-family des titres." },
  { key: "body", label: "Corps", hint: "Pile CSS du texte courant." },
  { key: "ui", label: "Interface", hint: "Pile CSS des boutons et données." },
];

// Couples encre/fond contrôlés par l'opérateur, testés au seuil AA (4.5:1). L'encre de
// l'accent est calculée automatiquement (readableInk) → jamais dans cette liste.
const CONTRAST_PAIRS: ReadonlyArray<{ ink: keyof OrgStylePalette; bg: keyof OrgStylePalette; label: string }> = [
  { ink: "text", bg: "bg", label: "le texte courant sur le fond" },
  { ink: "textEmphasis", bg: "bg", label: "le texte accentué sur le fond" },
  { ink: "text", bg: "surface", label: "le texte sur les surfaces" },
  { ink: "text", bg: "surfaceRaised", label: "le texte sur les surfaces surélevées" },
];

const AA_THRESHOLD = 4.5;

/** #rgb / #rrggbb → #rrggbb minuscule (format exigé par <input type=color>). Vide si invalide. */
function normHex(hex: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return "";
  return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
}

export function orgStyleSettingsTab(store: FleetStore, org: OrgSummary | null, canManage: boolean): HTMLElement {
  if (!org) return el("span", {}, []);

  // Gating (CIN-080/F18) : module « personalization » requis. Le global_admin (super-admin)
  // garde l'accès pour piloter/réinitialiser le style de n'importe quelle org (F20).
  if (!store.hasModule(org.id, "personalization") && !store.isGlobalAdmin) {
    return upsellCard();
  }

  const container = el("div", {}, []);
  const build = (): void => container.replaceChildren(editor(store, org, canManage, build));
  build();
  return container;
}

/** Carte d'upsell (module non accordé). Style « grisé » cohérent avec les autres modules gatés. */
function upsellCard(): HTMLElement {
  const lockPath = "M6 11V7a4 4 0 0 1 8 0v4M5 11h10a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1H5a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1z";
  return el("div", { class: "card" }, [
    el("div", { class: "card-body text-center py-5" }, [
      el("div", { class: "text-secondary mb-3" }, [icon(lockPath, 40)]),
      el("h3", { class: "card-title" }, ["Personnalisation non incluse"]),
      el("p", { class: "text-secondary mb-0" }, [
        "Le module « Mes styles » n'est pas activé pour cette organisation. Il permet de définir les couleurs, les fontes et le titre affichés sur vos cabines. Contactez Kioskoscope pour l'ajouter à votre offre.",
      ]),
    ]),
  ]);
}

function editor(store: FleetStore, org: OrgSummary, canManage: boolean, rebuild: () => void): HTMLElement {
  const existing = store.orgStyleFor(org.id);
  const palette: PaletteDraft = { ...(existing?.palette ?? {}) };
  const fonts: FontsDraft = { ...(existing?.fonts ?? {}) };
  let title = existing?.title ?? "";
  const dis = canManage ? {} : { disabled: "true" };

  const effColor = (k: keyof OrgStylePalette): string => (palette[k] || MASTER_PALETTE[k]);
  const effFont = (k: keyof OrgStyleFonts): string => (fonts[k] || MASTER_FONTS[k]);

  // ── Aperçu live (mini écran cabine) ─────────────────────────────────────────
  const pvTitle = el("div", { style: "font-size:1.5rem;font-weight:700;line-height:1.1" }, [MASTER_TITLE]);
  const pvSubtitle = el("div", { style: "font-size:.85rem;margin-top:.25rem" }, ["Choisissez votre séance"]);
  const pvItemA = el("div", { style: "padding:.4rem .6rem;border-radius:.4rem;font-size:.8rem" }, ["Court métrage — 12 min"]);
  const pvItemB = el("div", { style: "padding:.4rem .6rem;border-radius:.4rem;font-size:.8rem;margin-top:.35rem" }, ["Documentaire — 24 min"]);
  const pvCard = el("div", { style: "padding:.6rem;border-radius:.6rem;margin-top:.9rem" }, [pvItemA, pvItemB]);
  const pvButton = el("div", { style: "display:inline-block;margin-top:.9rem;padding:.5rem 1.1rem;border-radius:.5rem;font-size:.85rem;font-weight:600" }, ["Regarder"]);
  // Mention NON supprimable — pas de contrôle pour la retirer, ici comme côté cabine.
  const pvFooter = el("div", { style: "font-size:.7rem;margin-top:1rem;opacity:.6" }, ["propulsé par Kioskoscope"]);
  const pvScreen = el("div", { style: "border-radius:.9rem;padding:1.25rem;min-height:15rem;transition:background .15s" }, [pvTitle, pvSubtitle, pvCard, pvButton, pvFooter]);
  const contrastBox = el("div", { class: "mt-3" }, []);

  const update = (): void => {
    pvScreen.style.background = effColor("bg");
    pvTitle.style.color = effColor("textEmphasis");
    pvTitle.style.fontFamily = effFont("display");
    pvTitle.textContent = title.trim() || MASTER_TITLE;
    pvSubtitle.style.color = effColor("text");
    pvSubtitle.style.fontFamily = effFont("body");
    pvCard.style.background = effColor("surface");
    for (const it of [pvItemA, pvItemB]) {
      it.style.color = effColor("text");
      it.style.fontFamily = effFont("body");
    }
    pvItemB.style.background = effColor("surfaceRaised");
    pvButton.style.background = effColor("accent");
    pvButton.style.color = readableInk(effColor("accent"));
    pvButton.style.fontFamily = effFont("ui");
    pvFooter.style.color = effColor("text");
    // Contraste automatique : on prévient (jamais on ne bloque) sous le seuil AA.
    const failing = CONTRAST_PAIRS.map((p) => ({ p, ratio: contrastRatio(effColor(p.ink), effColor(p.bg)) })).filter((r) => r.ratio < AA_THRESHOLD);
    if (failing.length === 0) {
      contrastBox.replaceChildren(el("div", { class: "text-green small d-flex align-items-center gap-1" }, ["✓ Contrastes lisibles (AA respecté)."]));
    } else {
      contrastBox.replaceChildren(
        el("div", { class: "alert alert-warning mb-0" }, [
          // Enfant unique en bloc : `.alert` de Tabler est en flex → sans ce wrapper, les
          // messages s'aligneraient en colonnes. Ici ils s'empilent proprement.
          el("div", {}, [
            el("div", { class: "fw-bold mb-1" }, ["Lisibilité à vérifier"]),
            ...failing.map((r) => el("div", { class: "small" }, [`${r.p.label.charAt(0).toUpperCase() + r.p.label.slice(1)} risque d'être peu lisible (contraste ${r.ratio.toFixed(1)}:1, en dessous du seuil recommandé de ${AA_THRESHOLD}:1).`])),
          ]),
        ]),
      );
    }
  };

  // ── Champs couleur (input type=color + hex synchronisés) ────────────────────
  const colorField = (slot: (typeof COLOR_SLOTS)[number]): HTMLElement => {
    const current = palette[slot.key] ?? "";
    const swatch = el("input", { type: "color", class: "form-control form-control-color", value: normHex(current) || MASTER_PALETTE[slot.key], title: slot.label, ...dis }) as HTMLInputElement;
    const hex = el("input", { type: "text", class: "form-control", value: current, placeholder: `${MASTER_PALETTE[slot.key]} (maître)`, maxlength: "7", spellcheck: "false", autocomplete: "off", ...dis }) as HTMLInputElement;
    swatch.addEventListener("input", () => {
      palette[slot.key] = swatch.value;
      hex.value = swatch.value;
      hex.classList.remove("is-invalid");
      update();
    });
    hex.addEventListener("input", () => {
      const v = hex.value.trim();
      if (v === "") {
        delete palette[slot.key];
        swatch.value = MASTER_PALETTE[slot.key];
        hex.classList.remove("is-invalid");
      } else if (parseHexColor(v)) {
        palette[slot.key] = v;
        swatch.value = normHex(v);
        hex.classList.remove("is-invalid");
      } else {
        hex.classList.add("is-invalid"); // saisie invalide : on n'écrit pas le brouillon
        return;
      }
      update();
    });
    return el("div", { class: "col-md-6 mb-3" }, [
      el("label", { class: "form-label" }, [slot.label]),
      el("div", { class: "input-group" }, [swatch, hex]),
      el("div", { class: "form-hint" }, [slot.hint]),
    ]);
  };

  // ── Champs fonte ────────────────────────────────────────────────────────────
  const fontField = (role: (typeof FONT_ROLES)[number]): HTMLElement => {
    const input = el("input", { type: "text", class: "form-control", value: fonts[role.key] ?? "", placeholder: MASTER_FONTS[role.key], spellcheck: "false", autocomplete: "off", ...dis }) as HTMLInputElement;
    input.addEventListener("input", () => {
      const v = input.value.trim();
      if (v === "") delete fonts[role.key];
      else fonts[role.key] = v;
      update();
    });
    return el("div", { class: "col-md-4 mb-3" }, [
      el("label", { class: "form-label" }, [role.label]),
      input,
      el("div", { class: "form-hint" }, [role.hint]),
    ]);
  };

  // ── Titre ───────────────────────────────────────────────────────────────────
  const titleInput = el("input", { type: "text", class: "form-control", value: title, placeholder: `${MASTER_TITLE} (maître)`, maxlength: "60", autocomplete: "off", ...dis }) as HTMLInputElement;
  titleInput.addEventListener("input", () => {
    title = titleInput.value;
    update();
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const status = el("div", { class: "small" }, []);
  const save = el("button", { class: "btn btn-primary", type: "button", ...dis }, ["Enregistrer"]);
  save.addEventListener("click", () => {
    status.className = "small text-secondary";
    status.textContent = "Enregistrement…";
    save.setAttribute("disabled", "true");
    void store.upsertOrgStyle(org.id, buildStyle(palette, fonts, title)).then((res) => {
      if (!canManage) return;
      save.removeAttribute("disabled");
      if (res.ok) {
        status.className = "small text-green";
        status.textContent = "Enregistré ✓";
      } else {
        status.className = "small text-danger";
        status.textContent = res.error ?? "Échec de l'enregistrement.";
      }
    });
  });

  const reset = el("button", { class: "btn btn-outline-danger", type: "button", ...dis }, ["Réinitialiser au style maître"]);
  reset.addEventListener("click", () => {
    if (!confirm("Réinitialiser au style maître Kioskoscope ? Les couleurs, fontes et titre de votre organisation seront supprimés — vos cabines reviendront à l'apparence par défaut.")) return;
    status.className = "small text-secondary";
    status.textContent = "Réinitialisation…";
    void store.resetOrgStyle(org.id).then((res) => {
      if (res.ok) rebuild(); // re-seed depuis le store (désormais vide) → champs vidés, aperçu maître
      else {
        status.className = "small text-danger";
        status.textContent = res.error ?? "Échec de la réinitialisation.";
      }
    });
  });

  const emptyBanner = existing
    ? el("span", {}, [])
    : el("div", { class: "alert alert-info" }, ["Style maître Kioskoscope actif. Définissez vos couleurs, fontes ou titre ci-dessous pour personnaliser vos cabines ; un champ laissé vide conserve le style maître."]);

  update();

  const form = el("div", { class: "card" }, [
    el("div", { class: "card-body" }, [
      el("h3", { class: "card-title" }, ["Couleurs"]),
      el("div", { class: "row" }, COLOR_SLOTS.map(colorField)),
      el("hr", {}, []),
      el("h3", { class: "card-title" }, ["Fontes"]),
      el("p", { class: "text-secondary small" }, ["Piles CSS font-family. Utilisez des polices web-safe (disponibles sur les cabines) ou des piles de repli. L'import de polices de marque arrivera dans une version ultérieure."]),
      el("div", { class: "row" }, FONT_ROLES.map(fontField)),
      el("hr", {}, []),
      el("h3", { class: "card-title" }, ["Titre de marque"]),
      el("div", { class: "mb-2" }, [titleInput, el("div", { class: "form-hint" }, ["Affiché sur l'écran d'attente des cabines."])]),
      canManage
        ? el("div", { class: "d-flex align-items-center gap-3 mt-3 flex-wrap" }, [save, reset, status])
        : el("div", { class: "alert alert-secondary mt-3 mb-0" }, ["Lecture seule — seul un super-utilisateur de l'organisation peut modifier le style."]),
    ]),
  ]);

  const previewCol = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [el("h3", { class: "card-title m-0" }, ["Aperçu"]), el("div", { class: "card-subtitle" }, ["Rendu approché d'un écran cabine."])]),
    el("div", { class: "card-body" }, [pvScreen, contrastBox]),
  ]);

  return el("div", {}, [
    emptyBanner,
    el("div", { class: "row row-cards" }, [
      el("div", { class: "col-lg-7" }, [form]),
      el("div", { class: "col-lg-5" }, [previewCol]),
    ]),
  ]);
}

/**
 * Assemble un `OrgStyle` à partir des brouillons. Seuls les slots renseignés et VALIDES sont
 * inclus (un slot omis = maître). exactOptionalPropertyTypes → spreads conditionnels ; aucun
 * bloc vide n'est posé (palette/fonts/title absents plutôt que `{}`).
 */
function buildStyle(palette: PaletteDraft, fonts: FontsDraft, title: string): OrgStyle {
  const pal: PaletteDraft = {};
  for (const s of COLOR_SLOTS) {
    const v = (palette[s.key] ?? "").trim();
    if (v && parseHexColor(v)) pal[s.key] = normHex(v);
  }
  const fnt: FontsDraft = {};
  for (const f of FONT_ROLES) {
    const v = (fonts[f.key] ?? "").trim();
    if (v) fnt[f.key] = v;
  }
  const t = title.trim();
  return {
    ...(Object.keys(pal).length ? { palette: pal } : {}),
    ...(Object.keys(fnt).length ? { fonts: fnt } : {}),
    ...(t ? { title: t } : {}),
  };
}
