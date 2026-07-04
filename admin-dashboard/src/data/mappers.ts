import type { Booth, BoothTelemetry } from "../domain/types";

// Conversion entre les lignes Postgres (snake_case) et le modèle de domaine
// (camelCase). Les agrégats (sessions/revenu/historique/logs du jour) viennent de
// requêtes séparées (sessions/plays/daily_stats) — ici on mappe la ligne `booths`
// et on met des valeurs par défaut pour ces agrégats (remplies ensuite).

interface BoothRow {
  id: string;
  organization_id: string;
  label: string;
  location: string;
  address: string;
  gps_lat: number | null;
  gps_lng: number | null;
  health: Booth["health"];
  indicators: string[];
  software_version: string;
  last_heartbeat_at: string | null;
  telemetry: Partial<BoothTelemetry> | null;
  notes: string;
}

const DEFAULT_TELEMETRY: BoothTelemetry = {
  uptimePct: 0,
  temperatureC: 0,
  storageFreePct: 0,
  cpuLoadPct: 0,
  currentFilmTitle: null,
  connection: "wifi",
  signalPct: 0,
};

export function rowToBooth(row: BoothRow): Booth {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    location: row.location,
    address: row.address,
    gpsLat: row.gps_lat,
    gpsLng: row.gps_lng,
    health: row.health,
    indicators: (row.indicators ?? []) as Booth["indicators"],
    softwareVersion: row.software_version,
    lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : 0,
    telemetry: { ...DEFAULT_TELEMETRY, ...(row.telemetry ?? {}) },
    notes: row.notes ?? "",
    // Agrégats calculés séparément (Phase 1 suite) :
    sessionsToday: 0,
    revenueTodayCents: 0,
    history: [],
    logs: [],
  };
}

/** Ligne à écrire dans `booths` (upsert). Les agrégats ne sont pas persistés ici. */
export function boothToRow(b: Booth): Record<string, unknown> {
  return {
    id: b.id,
    organization_id: b.organizationId,
    label: b.label,
    location: b.location,
    address: b.address,
    gps_lat: b.gpsLat,
    gps_lng: b.gpsLng,
    health: b.health,
    indicators: b.indicators,
    software_version: b.softwareVersion,
    telemetry: b.telemetry,
    notes: b.notes,
  };
}
