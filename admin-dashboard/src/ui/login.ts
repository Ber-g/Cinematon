import type { FleetStore } from "../data/store";
import { el } from "./dom";

// Écran de connexion (mode Supabase). Email + mot de passe → Supabase Auth.
// L'identité (global_admin / org / rôle) est ensuite chargée depuis la base.
export function loginScreen(store: FleetStore): HTMLElement {
  const email = el("input", { class: "form-control", type: "email", placeholder: "vous@exemple.com", autocomplete: "username" }) as HTMLInputElement;
  const password = el("input", { class: "form-control", type: "password", placeholder: "Mot de passe", autocomplete: "current-password" }) as HTMLInputElement;
  const error = el("div", { class: "alert alert-danger d-none" }, []);
  const submit = el("button", { class: "btn btn-primary w-100", type: "submit" }, ["Se connecter"]);

  const form = el("form", { class: "card card-md" }, [
    el("div", { class: "card-body" }, [
      el("h1", { class: "text-center mb-1 fw-bold" }, ["CINEMATON"]),
      el("p", { class: "text-secondary text-center mb-4" }, ["Back-office — connexion"]),
      error,
      el("div", { class: "mb-3" }, [el("label", { class: "form-label" }, ["Email"]), email]),
      el("div", { class: "mb-3" }, [el("label", { class: "form-label" }, ["Mot de passe"]), password]),
      el("div", { class: "form-footer" }, [submit]),
    ]),
  ]);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    error.classList.add("d-none");
    submit.setAttribute("disabled", "true");
    submit.textContent = "Connexion…";
    void store.signIn(email.value.trim(), password.value).then((res) => {
      if (!res.ok) {
        error.textContent = res.error ?? "Échec de la connexion.";
        error.classList.remove("d-none");
        submit.removeAttribute("disabled");
        submit.textContent = "Se connecter";
      }
      // Succès : le store émet → l'app re-render sur le dashboard.
    });
  });

  return el("div", { class: "page page-center" }, [
    el("div", { class: "container container-tight py-4", style: "max-width: 26rem" }, [form]),
  ]);
}
