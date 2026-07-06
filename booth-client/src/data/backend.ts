import type { Film, Play, Session } from "../domain/types";
import { supabase } from "./supabase";

// Adaptateur backend de la cabine : lit le catalogue réel (médias de son org) et
// remonte les séances/lectures vers Supabase. La borne = un DEVICE authentifié
// (compte membre de l'org) → la RLS scope automatiquement lecture et écriture.
//
// ⚠️ Sécurité (@qa, à durcir avant la rue) : pour le prototype, le compte-device peut
// être un compte à droits d'écriture (super_user/manager). À terme : un rôle `device`
// dédié + une policy d'INSERT minimale (sessions/plays de SA cabine uniquement).

interface BoothConfig {
  readonly boothId: string;
  readonly orgId: string;
  readonly deviceEmail: string;
  readonly devicePassword: string;
}

function readConfig(): BoothConfig | null {
  const boothId = import.meta.env.VITE_BOOTH_ID as string | undefined;
  const orgId = import.meta.env.VITE_ORG_ID as string | undefined;
  const deviceEmail = import.meta.env.VITE_DEVICE_EMAIL as string | undefined;
  const devicePassword = import.meta.env.VITE_DEVICE_PASSWORD as string | undefined;
  if (boothId && orgId && deviceEmail && devicePassword) return { boothId, orgId, deviceEmail, devicePassword };
  return null;
}

/** Ligne `media` (snake_case) → `Film` (= `Media`, camelCase). */
function rowToFilm(row: Record<string, unknown>): Film {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    contentHash: String(row.content_hash ?? ""),
    title: String(row.title ?? ""),
    year: (row.year as number | null) ?? 0,
    durationSeconds: Number(row.duration_seconds ?? 0),
    storageUrl: (row.storage_url as string | null) ?? null,
    version: Number(row.version ?? 1),
    active: Boolean(row.active),
    tmdbId: (row.tmdb_id as number | null) ?? null,
    genres: arr(row.genres),
    moods: arr(row.moods),
    tags: arr(row.tags),
    audienceTags: arr(row.audience_tags),
    language: String(row.language ?? "fr"),
    subtitles: [],
    director: String(row.director ?? ""),
    synopsis: String(row.synopsis ?? ""),
    stills: arr(row.stills),
    learnMoreUrl: (row.learn_more_url as string | null) ?? null,
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).getTime() : null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    protection: (row.protection as Film["protection"]) ?? "none",
    drmScheme: (row.drm_scheme as string | null) ?? null,
    sourceProtected: Boolean(row.source_protected),
  };
}

export class BoothBackend {
  private readonly cfg = readConfig();

  /** La cabine est-elle branchée sur Supabase (config présente + client) ? */
  get isConfigured(): boolean {
    return this.cfg !== null && supabase !== null;
  }
  get boothId(): string {
    return this.cfg?.boothId ?? "";
  }
  get organizationId(): string {
    return this.cfg?.orgId ?? "";
  }

  /** Authentifie le device. `false` si non configuré ou échec (→ mode mock). */
  async init(): Promise<boolean> {
    if (!this.cfg || !supabase) return false;
    const { error } = await supabase.auth.signInWithPassword({ email: this.cfg.deviceEmail, password: this.cfg.devicePassword });
    if (error) {
      console.error("[booth] authentification device échouée :", error.message);
      return false;
    }
    return true;
  }

  /** Remonte l'état vivant de la cabine : version logicielle + dernier contact (F3). */
  async reportHeartbeat(version: string): Promise<void> {
    if (!supabase || !this.cfg) return;
    const { error } = await supabase
      .from("booths")
      .update({ software_version: version, last_heartbeat_at: new Date().toISOString() })
      .eq("id", this.cfg.boothId);
    if (error) console.error("[booth] heartbeat :", error.message);
  }

  /** Catalogue réel de l'org (médias actifs, scoping RLS). */
  async loadCatalog(): Promise<Film[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from("media").select("*").eq("active", true);
    if (error) {
      console.error("[booth] chargement catalogue :", error.message);
      return [];
    }
    return (data ?? []).map((r) => rowToFilm(r as Record<string, unknown>));
  }

  /** Remonte une séance close + ses lectures. Fire-and-forget (n'interrompt pas le parcours). */
  async saveSession(snapshot: { session: Session; plays: readonly Play[] }): Promise<void> {
    if (!supabase || !this.cfg) return;
    const s = snapshot.session;
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        organization_id: this.cfg.orgId,
        booth_id: this.cfg.boothId,
        started_at: new Date(s.startedAt).toISOString(),
        ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        share_token: s.shareToken,
        unlock_method: s.unlockMethod,
        amount_cents: s.amount != null ? Math.round(s.amount) : null,
        payment_provider_ref: s.paymentProviderRef,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[booth] remontée séance :", error?.message);
      return;
    }
    const sessionId = String((data as { id: string }).id);
    if (snapshot.plays.length > 0) {
      const rows = snapshot.plays.map((p) => ({
        organization_id: this.cfg!.orgId,
        session_id: sessionId,
        media_id: p.filmId,
        position: p.position,
        started_at: new Date(p.startedAt).toISOString(),
        completed: p.completed,
        source: p.source,
      }));
      const { error: pe } = await supabase.from("plays").insert(rows);
      if (pe) console.error("[booth] remontée lectures :", pe.message);
    }
  }
}
