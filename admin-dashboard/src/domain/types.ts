// Types du back-office. Le modèle canonique (Booth, Organization, Media, enums…)
// vient du domaine partagé `@cinematon/domain` ; ici, uniquement l'état de session
// UI spécifique au back-office.

import type { OrgRole, User } from "@cinematon/domain";

export type {
  HealthStatus,
  BoothIndicator,
  ConnectionType,
  OrgRole,
  OrganizationType,
  Organization,
  User,
  Membership,
  DailyStat,
  BoothLog,
  BoothTelemetry,
  Booth,
  Subtitle,
  Media,
  StorageType,
  StorageLocation,
  MediaInstance,
} from "@cinematon/domain";

/**
 * Identité active dans le back-office (mock). `global_admin` voit tout ; sinon la
 * vue est scopée à `activeOrganizationId` avec le rôle correspondant.
 */
export interface CurrentIdentity {
  readonly user: User;
  readonly activeOrganizationId: string | null;
  readonly role: OrgRole | null;
}
