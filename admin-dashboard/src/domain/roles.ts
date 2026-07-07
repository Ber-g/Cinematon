import type { OrgRole } from "./types";

// Rôles fixes + matrice de permissions. La matrice REFLÈTE la RLS (0002/0006) :
// - contenu (médias) & Kiosks : super_user + manager (can_write_org)
// - membres, réglages org, facturation : super_user only (is_org_super_user)
// - lecture : tous les membres

export const ROLE_ORDER: readonly OrgRole[] = ["super_user", "manager", "operator", "viewer"];

export const ROLE_LABELS: Record<OrgRole, string> = {
  super_user: "Super-utilisateur",
  manager: "Manager",
  operator: "Opérateur",
  viewer: "Observateur",
};

export const ROLE_HINTS: Record<OrgRole, string> = {
  super_user: "Contrôle total de l'organisation (membres, réglages, paiement).",
  manager: "Gère le contenu et les Kiosks, pas les membres ni la facturation.",
  operator: "Exploitation courante ; lecture étendue.",
  viewer: "Lecture seule.",
};

export interface Permission {
  readonly label: string;
  readonly roles: Record<OrgRole, boolean>;
}

export const PERMISSION_MATRIX: readonly Permission[] = [
  { label: "Consulter (flotte, médias, revenus)", roles: { super_user: true, manager: true, operator: true, viewer: true } },
  { label: "Gérer les médias & le contenu", roles: { super_user: true, manager: true, operator: false, viewer: false } },
  { label: "Gérer les Kiosks", roles: { super_user: true, manager: true, operator: false, viewer: false } },
  { label: "Gérer les membres & invitations", roles: { super_user: true, manager: false, operator: false, viewer: false } },
  { label: "Réglages de l'organisation", roles: { super_user: true, manager: false, operator: false, viewer: false } },
  { label: "Facturation & intégrations paiement", roles: { super_user: true, manager: false, operator: false, viewer: false } },
];
