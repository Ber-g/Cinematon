import { Modal } from "bootstrap";
import type { Media } from "../domain/types";
import type { FleetStore } from "../data/store";
import { sha256Hex } from "../data/hash";
import { el } from "./dom";

// Page de gestion des médias (F8) + modale d'ajout/édition. CRUD sur Supabase,
// hachage SHA-256 côté client, anti-doublons imposé par la base, filtrage par
// tags d'audience, indication de conformité à la whitelist de l'organisation.

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m > 0 ? `${m} min` : `${seconds}s`;
}

export function mediaPage(store: FleetStore, onChanged: () => void): HTMLElement {
  const all = store.mediaList();

  // Filtre par tag d'audience.
  const tagSet = new Set<string>();
  for (const m of all) for (const t of m.audienceTags) tagSet.add(t);
  const state = { tag: null as string | null };

  const render = (): HTMLElement => {
    const list = state.tag ? all.filter((m) => m.audienceTags.includes(state.tag!)) : all;

    const chips = [...tagSet].sort().map((t) => {
      const b = el("button", { class: `chip ${state.tag === t ? "chip--on" : ""}`, type: "button" }, [t]);
      b.addEventListener("click", () => {
        state.tag = state.tag === t ? null : t;
        container.replaceChildren(render());
      });
      return b;
    });

    const rows = list.map((m) => {
      const tr = el("tr", {}, [
        el("td", {}, [el("div", { class: "fw-bold" }, [m.title]), el("div", { class: "text-secondary small" }, [`${m.director || "—"} · ${m.year || "—"}`])]),
        el("td", { class: "text-secondary" }, [formatDuration(m.durationSeconds)]),
        el("td", { class: "text-secondary" }, [m.language.toUpperCase()]),
        el("td", {}, [el("span", { class: "d-inline-flex flex-wrap gap-1" }, m.audienceTags.map((t) => el("span", { class: "badge bg-secondary-lt" }, [t])))]),
        el("td", { class: "text-secondary text-nowrap" }, [m.contentHash.slice(0, 10) + "…"]),
        el("td", { class: "text-end" }, [rowActions(store, m, onChanged)]),
      ]);
      return tr;
    });

    const add = el("button", { class: "btn btn-primary", type: "button" }, ["Ajouter un média"]);
    add.addEventListener("click", () => openMediaForm(store, null, onChanged));

    return el("div", {}, [
      el("div", { class: "d-flex align-items-center justify-content-between mb-3" }, [
        el("div", {}, [el("h2", { class: "page-title m-0" }, ["Médias"]), el("div", { class: "text-secondary" }, [`${all.length} média(s)`])]),
        add,
      ]),
      tagSet.size > 0 ? el("div", { class: "chips mb-3" }, chips) : el("span", {}, []),
      list.length === 0
        ? el("div", { class: "card" }, [el("div", { class: "card-body text-secondary text-center py-5" }, ["Aucun média. Cliquez sur « Ajouter un média »."])])
        : el("div", { class: "card" }, [
            el("div", { class: "table-responsive" }, [
              el("table", { class: "table table-vcenter card-table" }, [
                el("thead", {}, [el("tr", {}, [el("th", {}, ["Titre"]), el("th", {}, ["Durée"]), el("th", {}, ["Langue"]), el("th", {}, ["Tags d'audience"]), el("th", {}, ["Empreinte"]), el("th", {}, [])])]),
                el("tbody", {}, rows),
              ]),
            ]),
          ]),
    ]);
  };

  const container = el("div", {}, [render()]);
  return container;
}

function rowActions(store: FleetStore, m: Media, onChanged: () => void): HTMLElement {
  const edit = el("button", { class: "btn btn-sm", type: "button" }, ["Modifier"]);
  edit.addEventListener("click", () => openMediaForm(store, m, onChanged));
  const del = el("button", { class: "btn btn-sm btn-outline-danger ms-1", type: "button" }, ["Suppr."]);
  del.addEventListener("click", () => {
    if (confirm(`Supprimer « ${m.title} » ?`)) void store.deleteMedia(m.id).then(onChanged);
  });
  return el("span", { class: "btn-list justify-content-end" }, [edit, del]);
}

// ── Modale d'ajout / édition ─────────────────────────────────────────────────
export function openMediaForm(store: FleetStore, existing: Media | null, onChanged: () => void): void {
  const isNew = existing === null;
  const orgs = store.organizations();
  const identity = store.current;
  const defaultOrg = identity?.activeOrganizationId ?? orgs[0]?.id ?? "";

  const base: Media =
    existing ??
    ({
      id: crypto.randomUUID(),
      organizationId: defaultOrg,
      contentHash: "",
      title: "",
      year: new Date().getFullYear(),
      durationSeconds: 0,
      storageUrl: null,
      version: 1,
      active: true,
      tmdbId: null,
      genres: [],
      moods: [],
      tags: [],
      audienceTags: [],
      language: "fr",
      subtitles: [],
      director: "",
      synopsis: "",
      stills: [],
      learnMoreUrl: null,
    } satisfies Media);

  let file: File | null = null;
  let computedHash = base.contentHash;

  const field = (label: string, input: HTMLElement): HTMLElement =>
    el("div", { class: "col-md-6 mb-3" }, [el("label", { class: "form-label" }, [label]), input]);

  const title = el("input", { class: "form-control", type: "text", value: base.title }) as HTMLInputElement;
  const director = el("input", { class: "form-control", type: "text", value: base.director }) as HTMLInputElement;
  const year = el("input", { class: "form-control", type: "number", value: String(base.year) }) as HTMLInputElement;
  const duration = el("input", { class: "form-control", type: "number", value: String(base.durationSeconds), placeholder: "secondes" }) as HTMLInputElement;
  const language = el("input", { class: "form-control", type: "text", value: base.language, maxlength: "5" }) as HTMLInputElement;
  const audienceTags = el("input", { class: "form-control", type: "text", value: base.audienceTags.join(", "), placeholder: "18+, bar, enfant…" }) as HTMLInputElement;
  const synopsis = el("textarea", { class: "form-control", rows: "2" }, [base.synopsis]) as HTMLTextAreaElement;

  const orgSelect = el(
    "select",
    { class: "form-select" },
    orgs.map((o) => el("option", { value: o.id, ...(o.id === base.organizationId ? { selected: "selected" } : {}) }, [o.name])),
  ) as HTMLSelectElement;

  const fileInput = el("input", { class: "form-control", type: "file", accept: "video/*" }) as HTMLInputElement;
  const hashInfo = el("div", { class: "form-hint" }, [isNew ? "Choisissez un fichier : son empreinte SHA-256 est calculée pour détecter les doublons." : "Empreinte existante conservée."]);
  fileInput.addEventListener("change", () => {
    file = fileInput.files?.[0] ?? null;
    if (!file) return;
    hashInfo.textContent = "Calcul de l'empreinte…";
    void sha256Hex(file).then((h) => {
      computedHash = h;
      if (!title.value) title.value = file!.name.replace(/\.[^.]+$/, "");
      hashInfo.textContent = `Empreinte : ${h.slice(0, 24)}…`;
    });
  });

  const error = el("div", { class: "alert alert-danger d-none" }, []);
  const save = el("button", { class: "btn btn-primary ms-auto", type: "button" }, [isNew ? "Ajouter" : "Enregistrer"]);

  const body = el("div", {}, [
    error,
    el("div", { class: "row" }, [
      field("Organisation", orgSelect),
      field("Fichier vidéo", el("div", {}, [fileInput, hashInfo])),
      field("Titre", title),
      field("Réalisateur", director),
      field("Année", year),
      field("Durée (secondes)", duration),
      field("Langue (ISO)", language),
      field("Tags d'audience", audienceTags),
    ]),
    el("div", { class: "mb-2" }, [el("label", { class: "form-label" }, ["Synopsis"]), synopsis]),
  ]);

  const modalEl = el("div", { class: "modal modal-blur fade", tabindex: "-1" }, [
    el("div", { class: "modal-dialog modal-lg modal-dialog-centered" }, [
      el("div", { class: "modal-content" }, [
        el("div", { class: "modal-header" }, [
          el("h3", { class: "modal-title" }, [isNew ? "Nouveau média" : "Modifier le média"]),
          el("button", { class: "btn-close", type: "button", "data-bs-dismiss": "modal" }, []),
        ]),
        el("div", { class: "modal-body" }, [body]),
        el("div", { class: "modal-footer" }, [el("button", { class: "btn", type: "button", "data-bs-dismiss": "modal" }, ["Annuler"]), save]),
      ]),
    ]),
  ]);
  document.body.append(modalEl);
  const modal = new Modal(modalEl);

  save.addEventListener("click", () => {
    error.classList.add("d-none");
    if (!title.value.trim()) {
      title.classList.add("is-invalid");
      return;
    }
    if (isNew && !file) {
      error.textContent = "Un fichier vidéo est requis (pour calculer l'empreinte).";
      error.classList.remove("d-none");
      return;
    }
    const parseTags = (s: string): string[] => s.split(",").map((t) => t.trim()).filter(Boolean);
    const media: Media = {
      ...base,
      organizationId: orgSelect.value,
      contentHash: computedHash,
      title: title.value.trim(),
      director: director.value.trim(),
      year: Number(year.value) || 0,
      durationSeconds: Number(duration.value) || 0,
      language: language.value.trim() || "fr",
      audienceTags: parseTags(audienceTags.value),
      synopsis: synopsis.value.trim(),
    };

    save.setAttribute("disabled", "true");
    save.textContent = "Enregistrement…";
    const done = (res: { ok: boolean; error?: string }): void => {
      if (res.ok) {
        modal.hide();
        onChanged();
      } else {
        error.textContent = res.error ?? "Erreur.";
        error.classList.remove("d-none");
        save.removeAttribute("disabled");
        save.textContent = isNew ? "Ajouter" : "Enregistrer";
      }
    };
    if (isNew) void store.addMedia(media, file).then(done);
    else void store.updateMedia(media).then(() => done({ ok: true }));
  });

  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove(), { once: true });
  modal.show();
}
