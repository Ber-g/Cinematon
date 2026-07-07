import { Modal } from "bootstrap";
import type { FleetStore, OrgMember, OrgSummary } from "../data/store";
import type { OrgRole } from "../domain/types";
import { PERMISSION_MATRIX, ROLE_HINTS, ROLE_LABELS, ROLE_ORDER } from "../domain/roles";
import { el } from "./dom";

// Menu Organisation (hub à onglets, patterns SaaS classiques) : Général, Membres,
// Invitations, Rôles & permissions, Kiosks, Paiement. La gestion (écriture) est
// réservée au super_user (aligné sur la RLS 0006) ; les autres voient en lecture.

type Tab = "general" | "members" | "invites" | "roles" | "booths" | "billing";
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "general", label: "Général" },
  { key: "members", label: "Membres" },
  { key: "invites", label: "Invitations" },
  { key: "roles", label: "Rôles & permissions" },
  { key: "booths", label: "Kiosks" },
  { key: "billing", label: "Paiement" },
];

export function settingsPage(store: FleetStore, onChanged: () => void): HTMLElement {
  const orgs = store.organizations();
  const state = {
    tab: "general" as Tab,
    orgId: store.current?.activeOrganizationId ?? orgs[0]?.id ?? null,
  };

  const container = el("div", {}, []);
  const render = (): void => {
    const org = orgs.find((o) => o.id === state.orgId) ?? null;
    const canManage = store.canManageOrg(state.orgId);

    // Sélecteur d'org (global_admin gère plusieurs orgs).
    const orgPicker =
      store.isGlobalAdmin && orgs.length > 0
        ? (() => {
            const sel = el("select", { class: "form-select w-auto" }, orgs.map((o) => el("option", { value: o.id, ...(o.id === state.orgId ? { selected: "selected" } : {}) }, [o.name]))) as HTMLSelectElement;
            sel.addEventListener("change", () => {
              state.orgId = sel.value;
              render();
            });
            return el("div", { class: "ms-auto d-flex align-items-center gap-2" }, [el("span", { class: "text-secondary" }, ["Organisation :"]), sel]);
          })()
        : el("span", {}, []);

    const tabsNav = el(
      "ul",
      { class: "nav nav-tabs mb-3" },
      TABS.map((t) => {
        const link = el("a", { class: `nav-link ${state.tab === t.key ? "active" : ""}`, href: "#" }, [t.label]);
        link.addEventListener("click", (e) => {
          e.preventDefault();
          state.tab = t.key;
          render();
        });
        return el("li", { class: "nav-item" }, [link]);
      }),
    );

    const body = el("div", {}, [tabRenderers[state.tab](store, org, canManage, onChanged)]);
    if (!canManage && (state.tab === "general" || state.tab === "members" || state.tab === "invites" || state.tab === "billing")) {
      body.prepend(el("div", { class: "alert alert-secondary" }, ["Lecture seule — seul un super-utilisateur de l'organisation peut modifier ces réglages."]));
    }

    container.replaceChildren(
      el("div", { class: "d-flex align-items-center mb-3 gap-2 flex-wrap" }, [
        el("div", {}, [el("h2", { class: "page-title m-0" }, ["Organisation"]), el("div", { class: "text-secondary" }, [org ? org.name : "Aucune organisation"])]),
        orgPicker,
      ]),
      org ? el("div", {}, [tabsNav, body]) : el("div", { class: "card" }, [el("div", { class: "card-body text-secondary" }, ["Aucune organisation à gérer."])]),
    );
  };

  render();
  return container;
}

// ── Onglet Général ────────────────────────────────────────────────────────────
function generalTab(store: FleetStore, org: OrgSummary | null, canManage: boolean, onChanged: () => void): HTMLElement {
  if (!org) return el("span", {}, []);
  const dis = canManage ? {} : { disabled: "true" };
  const name = el("input", { class: "form-control", type: "text", value: org.name, ...dis }) as HTMLInputElement;
  const type = el("select", { class: "form-select", ...dis }, (["bar", "festival", "event"] as const).map((t) => el("option", { value: t, ...(t === org.type ? { selected: "selected" } : {}) }, [t]))) as HTMLSelectElement;
  const region = el("input", { class: "form-control", type: "text", value: org.region ?? "", placeholder: "FR, BE…", ...dis }) as HTMLInputElement;
  const currency = el("input", { class: "form-control", type: "text", value: org.currency, maxlength: "3", ...dis }) as HTMLInputElement;
  const whitelist = el("input", { class: "form-control", type: "text", value: org.whitelistTags.join(", "), placeholder: "bar, 18+, enfant…", ...dis }) as HTMLInputElement;
  const theme = el("input", { class: "form-control", type: "text", value: org.themeId ?? "", placeholder: "id de thème (optionnel)", ...dis }) as HTMLInputElement;

  const field = (label: string, hint: string, input: HTMLElement): HTMLElement =>
    el("div", { class: "col-md-6 mb-3" }, [el("label", { class: "form-label" }, [label]), input, el("div", { class: "form-hint" }, [hint])]);

  const status = el("div", { class: "small" }, []);
  const save = el("button", { class: "btn btn-primary", type: "button", ...dis }, ["Enregistrer"]);
  save.addEventListener("click", () => {
    status.className = "small text-secondary";
    status.textContent = "Enregistrement…";
    void store
      .updateOrganization(org.id, {
        name: name.value.trim(),
        type: type.value,
        region: region.value.trim() || null,
        currency: (currency.value.trim() || "EUR").toUpperCase(),
        whitelistTags: whitelist.value.split(",").map((t) => t.trim()).filter(Boolean),
        themeId: theme.value.trim() || null,
      })
      .then((res) => {
        if (res.ok) {
          status.className = "small text-green";
          status.textContent = "Enregistré ✓";
          onChanged();
        } else {
          status.className = "small text-danger";
          status.textContent = res.error ?? "Échec.";
        }
      });
  });

  return el("div", { class: "card" }, [
    el("div", { class: "card-body" }, [
      el("div", { class: "row" }, [
        field("Nom", "Nom affiché de l'organisation.", name),
        field("Type d'organisation", "Nature de l'organisation (bar, festival, événement…). La catégorie du LIEU est réglée sur chaque Kiosk.", type),
        field("Région", "1 organisation = 1 région (code libre).", region),
        field("Devise", "ISO-4217 (EUR, GBP…). Pilote le formatage monétaire.", currency),
        field("Whitelist (tags d'audience)", "Médias non conformes exclus des Kiosks.", whitelist),
        field("Thème", "Identifiant de thème UI (optionnel).", theme),
      ]),
      canManage ? el("div", { class: "d-flex align-items-center gap-3" }, [save, status]) : el("span", {}, []),
    ]),
  ]);
}

// ── Onglet Membres ────────────────────────────────────────────────────────────
function membersTab(store: FleetStore, org: OrgSummary | null, canManage: boolean): HTMLElement {
  if (!org) return el("span", {}, []);
  const wrap = el("div", { class: "card" }, [el("div", { class: "card-body text-secondary" }, ["Chargement des membres…"])]);
  const load = (): void => {
    void store.orgMembers(org.id).then((members) => wrap.replaceChildren(membersTable(store, members, canManage, load)));
  };
  load();
  return wrap;
}

function membersTable(store: FleetStore, members: OrgMember[], canManage: boolean, reload: () => void): HTMLElement {
  const rows = members.map((m) => {
    const roleCell = canManage && !m.isSelf
      ? (() => {
          const sel = el("select", { class: "form-select form-select-sm w-auto" }, ROLE_ORDER.map((r) => el("option", { value: r, ...(r === m.role ? { selected: "selected" } : {}) }, [ROLE_LABELS[r]]))) as HTMLSelectElement;
          sel.addEventListener("change", () => {
            void store.setMemberRole(m.membershipId, sel.value as OrgRole).then((res) => {
              if (!res.ok) {
                alert(res.error ?? "Échec du changement de rôle.");
                sel.value = m.role;
              } else reload();
            });
          });
          return sel;
        })()
      : el("span", { class: "badge bg-secondary-lt" }, [ROLE_LABELS[m.role]]);

    const remove = canManage && !m.isSelf
      ? (() => {
          const b = el("button", { class: "btn btn-sm btn-outline-danger", type: "button" }, ["Retirer"]);
          b.addEventListener("click", () => {
            if (!confirm(`Retirer ${m.email} de l'organisation ?`)) return;
            void store.removeMember(m.membershipId).then((res) => (res.ok ? reload() : alert(res.error ?? "Échec.")));
          });
          return b;
        })()
      : el("span", { class: "text-secondary" }, [m.isSelf ? "vous" : ""]);

    return el("tr", {}, [
      el("td", {}, [el("div", { class: "fw-bold" }, [m.name || m.email]), m.name ? el("div", { class: "text-secondary small" }, [m.email]) : el("span", {}, [])]),
      el("td", {}, [roleCell]),
      el("td", { class: "text-end" }, [remove]),
    ]);
  });

  return el("div", { class: "card" }, [
    el("div", { class: "table-responsive" }, [
      el("table", { class: "table table-vcenter card-table" }, [
        el("thead", {}, [el("tr", {}, [el("th", {}, ["Membre"]), el("th", {}, ["Rôle"]), el("th", {}, [])])]),
        el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: "3", class: "text-secondary text-center py-4" }, ["Aucun membre."])])]),
      ]),
    ]),
  ]);
}

// ── Onglet Invitations ────────────────────────────────────────────────────────
function invitesTab(store: FleetStore, org: OrgSummary | null, canManage: boolean): HTMLElement {
  if (!org) return el("span", {}, []);
  const wrap = el("div", {}, [el("div", { class: "card" }, [el("div", { class: "card-body text-secondary" }, ["Chargement…"])])]);
  const load = (): void => {
    void store.orgInvitations(org.id).then((invites) => {
      const list = invites.filter((i) => i.status === "pending");
      const rows = list.map((i) => {
        const link = `${location.origin}${location.pathname}?invite=${i.token}`;
        const copy = el("button", { class: "btn btn-sm", type: "button" }, ["Copier le lien"]);
        copy.addEventListener("click", () => void navigator.clipboard?.writeText(link).then(() => { copy.textContent = "Copié ✓"; }));
        const revoke = el("button", { class: "btn btn-sm btn-outline-danger ms-1", type: "button" }, ["Révoquer"]);
        revoke.addEventListener("click", () => void store.revokeInvitation(i.id).then((res) => (res.ok ? load() : alert(res.error ?? "Échec."))));
        return el("tr", {}, [
          el("td", { class: "fw-bold" }, [i.email]),
          el("td", {}, [el("span", { class: "badge bg-secondary-lt" }, [ROLE_LABELS[i.role]])]),
          el("td", { class: "text-secondary small" }, [`expire le ${new Date(i.expiresAt).toLocaleDateString("fr-FR")}`]),
          el("td", { class: "text-end" }, canManage ? [copy, revoke] : []),
        ]);
      });
      const table = el("div", { class: "card" }, [
        el("div", { class: "table-responsive" }, [
          el("table", { class: "table table-vcenter card-table" }, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["E-mail"]), el("th", {}, ["Rôle"]), el("th", {}, ["Expiration"]), el("th", {}, [])])]),
            el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: "4", class: "text-secondary text-center py-4" }, ["Aucune invitation en attente."])])]),
          ]),
        ]),
      ]);
      const invite = el("button", { class: "btn btn-primary mb-3", type: "button", ...(canManage ? {} : { disabled: "true" }) }, ["Inviter un membre"]);
      invite.addEventListener("click", () => openInviteModal(store, org.id, load));
      wrap.replaceChildren(canManage ? invite : el("span", {}, []), table);
    });
  };
  load();
  return wrap;
}

function openInviteModal(store: FleetStore, orgId: string, onDone: () => void): void {
  const email = el("input", { class: "form-control", type: "email", placeholder: "personne@exemple.com" }) as HTMLInputElement;
  const role = el("select", { class: "form-select" }, ROLE_ORDER.map((r) => el("option", { value: r }, [ROLE_LABELS[r]]))) as HTMLSelectElement;
  role.value = "viewer";
  const error = el("div", { class: "alert alert-danger d-none" }, []);
  const linkBox = el("div", { class: "d-none" }, []);
  const create = el("button", { class: "btn btn-primary ms-auto", type: "button" }, ["Créer l'invitation"]);

  create.addEventListener("click", () => {
    error.classList.add("d-none");
    if (!/.+@.+\..+/.test(email.value.trim())) {
      error.textContent = "E-mail invalide.";
      error.classList.remove("d-none");
      return;
    }
    create.setAttribute("disabled", "true");
    void store.createInvitation(orgId, email.value, role.value as OrgRole).then((res) => {
      create.removeAttribute("disabled");
      if (!res.ok || !res.link) {
        error.textContent = res.error ?? "Échec.";
        error.classList.remove("d-none");
        return;
      }
      const input = el("input", { class: "form-control", type: "text", value: res.link, readonly: "true" }) as HTMLInputElement;
      const copy = el("button", { class: "btn", type: "button" }, ["Copier"]);
      copy.addEventListener("click", () => void navigator.clipboard?.writeText(res.link!).then(() => { copy.textContent = "Copié ✓"; }));
      linkBox.replaceChildren(
        el("div", { class: "alert alert-success" }, ["Invitation créée. Envoyez ce lien à la personne (il expire dans 14 jours) :"]),
        el("div", { class: "input-group" }, [input, copy]),
      );
      linkBox.classList.remove("d-none");
      create.classList.add("d-none");
      onDone();
    });
  });

  const modalEl = el("div", { class: "modal modal-blur fade", tabindex: "-1" }, [
    el("div", { class: "modal-dialog modal-dialog-centered" }, [
      el("div", { class: "modal-content" }, [
        el("div", { class: "modal-header" }, [el("h3", { class: "modal-title" }, ["Inviter un membre"]), el("button", { class: "btn-close", type: "button", "data-bs-dismiss": "modal" }, [])]),
        el("div", { class: "modal-body" }, [
          error,
          el("div", { class: "mb-3" }, [el("label", { class: "form-label" }, ["E-mail"]), email]),
          el("div", { class: "mb-3" }, [el("label", { class: "form-label" }, ["Rôle"]), role]),
          linkBox,
        ]),
        el("div", { class: "modal-footer" }, [el("button", { class: "btn", type: "button", "data-bs-dismiss": "modal" }, ["Fermer"]), create]),
      ]),
    ]),
  ]);
  document.body.append(modalEl);
  const modal = new Modal(modalEl);
  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove(), { once: true });
  modal.show();
}

// ── Onglet Rôles & permissions (matrice statique) ─────────────────────────────
function rolesTab(): HTMLElement {
  const head = el("tr", {}, [el("th", {}, ["Permission"]), ...ROLE_ORDER.map((r) => el("th", { class: "text-center" }, [ROLE_LABELS[r]]))]);
  const rows = PERMISSION_MATRIX.map((p) =>
    el("tr", {}, [
      el("td", {}, [p.label]),
      ...ROLE_ORDER.map((r) => el("td", { class: "text-center" }, [p.roles[r] ? el("span", { class: "text-green" }, ["✓"]) : el("span", { class: "text-secondary" }, ["—"])])),
    ]),
  );
  const legend = el("div", { class: "card-body text-secondary small" }, ROLE_ORDER.map((r) => el("div", {}, [el("strong", {}, [ROLE_LABELS[r] + " : "]), ROLE_HINTS[r]])));
  return el("div", { class: "card" }, [
    el("div", { class: "table-responsive" }, [el("table", { class: "table table-vcenter card-table" }, [el("thead", {}, [head]), el("tbody", {}, rows)])]),
    legend,
  ]);
}

// ── Onglet Kiosks associées (lecture) ────────────────────────────────────────
function boothsTab(store: FleetStore, org: OrgSummary | null): HTMLElement {
  if (!org) return el("span", {}, []);
  const booths = store.visibleBooths().filter((b) => b.organizationId === org.id);
  const rows = booths.map((b) =>
    el("tr", {}, [
      el("td", {}, [el("div", { class: "fw-bold" }, [b.label]), el("div", { class: "text-secondary small" }, [b.location || b.address || "—"])]),
      el("td", { class: "text-secondary" }, [b.health]),
      el("td", { class: "text-secondary" }, [b.softwareVersion || "—"]),
    ]),
  );
  return el("div", { class: "card" }, [
    el("div", { class: "table-responsive" }, [
      el("table", { class: "table table-vcenter card-table" }, [
        el("thead", {}, [el("tr", {}, [el("th", {}, ["Kiosk"]), el("th", {}, ["Santé"]), el("th", {}, ["Version"])])]),
        el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: "3", class: "text-secondary text-center py-4" }, ["Aucun Kiosk associé."])])]),
      ]),
    ]),
  ]);
}

// ── Onglet Paiement (intégrations, config non-secrète) ────────────────────────
function billingTab(store: FleetStore, org: OrgSummary | null, canManage: boolean): HTMLElement {
  if (!org) return el("span", {}, []);
  const wrap = el("div", {}, [el("div", { class: "card" }, [el("div", { class: "card-body text-secondary" }, ["Chargement…"])])]);
  const load = (): void => {
    void store.orgPaymentIntegrations(org.id).then((integrations) => {
      const rows = integrations.map((pi) => {
        const del = el("button", { class: "btn btn-sm btn-outline-danger", type: "button" }, ["Suppr."]);
        del.addEventListener("click", () => {
          if (!confirm("Supprimer cette intégration ?")) return;
          void store.deletePaymentIntegration(pi.id).then((res) => (res.ok ? load() : alert(res.error ?? "Échec.")));
        });
        return el("tr", {}, [
          el("td", { class: "fw-bold" }, [pi.label || pi.provider]),
          el("td", {}, [pi.provider]),
          el("td", {}, [el("span", { class: `badge ${pi.mode === "live" ? "bg-red-lt" : "bg-secondary-lt"}` }, [pi.mode])]),
          el("td", {}, [el("span", { class: `badge ${pi.status === "active" ? "bg-green-lt" : "bg-secondary-lt"}` }, [pi.status])]),
          el("td", { class: "text-end" }, canManage ? [del] : []),
        ]);
      });
      const add = el("button", { class: "btn btn-primary mb-3", type: "button", ...(canManage ? {} : { disabled: "true" }) }, ["Ajouter une intégration"]);
      add.addEventListener("click", () => openIntegrationModal(store, org.id, load));
      wrap.replaceChildren(
        el("div", { class: "alert alert-info" }, [`Devise de l'organisation : ${org.currency}. Le sans-contact passe par le provider « card » (Stripe Terminal), branché en phase rue. Les secrets (clés API) sont stockés côté serveur — jamais ici.`]),
        canManage ? add : el("span", {}, []),
        el("div", { class: "card" }, [
          el("div", { class: "table-responsive" }, [
            el("table", { class: "table table-vcenter card-table" }, [
              el("thead", {}, [el("tr", {}, [el("th", {}, ["Libellé"]), el("th", {}, ["Provider"]), el("th", {}, ["Mode"]), el("th", {}, ["Statut"]), el("th", {}, [])])]),
              el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: "5", class: "text-secondary text-center py-4" }, ["Aucune intégration configurée."])])]),
            ]),
          ]),
        ]),
      );
    });
  };
  load();
  return wrap;
}

function openIntegrationModal(store: FleetStore, orgId: string, onDone: () => void): void {
  const label = el("input", { class: "form-control", type: "text", placeholder: "ex. Compte Stripe FR" }) as HTMLInputElement;
  const provider = el("select", { class: "form-select" }, ["mock", "free", "coin", "stripe_terminal", "sumup"].map((p) => el("option", { value: p }, [p]))) as HTMLSelectElement;
  const mode = el("select", { class: "form-select" }, ["test", "live"].map((m) => el("option", { value: m }, [m]))) as HTMLSelectElement;
  const status = el("select", { class: "form-select" }, ["inactive", "active", "error"].map((s) => el("option", { value: s }, [s]))) as HTMLSelectElement;
  const error = el("div", { class: "alert alert-danger d-none" }, []);
  const save = el("button", { class: "btn btn-primary ms-auto", type: "button" }, ["Enregistrer"]);
  save.addEventListener("click", () => {
    error.classList.add("d-none");
    save.setAttribute("disabled", "true");
    void store.savePaymentIntegration(orgId, { provider: provider.value, mode: mode.value, status: status.value, label: label.value.trim() }).then((res) => {
      save.removeAttribute("disabled");
      if (res.ok) {
        modal.hide();
        onDone();
      } else {
        error.textContent = res.error ?? "Échec.";
        error.classList.remove("d-none");
      }
    });
  });
  const field = (l: string, input: HTMLElement): HTMLElement => el("div", { class: "mb-3" }, [el("label", { class: "form-label" }, [l]), input]);
  const modalEl = el("div", { class: "modal modal-blur fade", tabindex: "-1" }, [
    el("div", { class: "modal-dialog modal-dialog-centered" }, [
      el("div", { class: "modal-content" }, [
        el("div", { class: "modal-header" }, [el("h3", { class: "modal-title" }, ["Intégration de paiement"]), el("button", { class: "btn-close", type: "button", "data-bs-dismiss": "modal" }, [])]),
        el("div", { class: "modal-body" }, [error, field("Libellé", label), field("Provider", provider), field("Mode", mode), field("Statut", status), el("div", { class: "form-hint" }, ["Config non-secrète uniquement. Les clés API se configurent côté serveur (Vault)."])]),
        el("div", { class: "modal-footer" }, [el("button", { class: "btn", type: "button", "data-bs-dismiss": "modal" }, ["Annuler"]), save]),
      ]),
    ]),
  ]);
  document.body.append(modalEl);
  const modal = new Modal(modalEl);
  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove(), { once: true });
  modal.show();
}

const tabRenderers: Record<Tab, (store: FleetStore, org: OrgSummary | null, canManage: boolean, onChanged: () => void) => HTMLElement> = {
  general: generalTab,
  members: membersTab,
  invites: invitesTab,
  roles: () => rolesTab(),
  booths: (store, org) => boothsTab(store, org),
  billing: billingTab,
};
