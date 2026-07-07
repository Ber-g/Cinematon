import type { Film, Play, Session } from "../domain/types";
import { supabase } from "./supabase";

// Adaptateur backend de la Kiosk : lit le catalogue réel (médias de son org) et
// remonte les séances/lectures vers Supabase. La borne = un DEVICE authentifié
// (compte membre de l'org) → la RLS scope automatiquement lecture et écriture.
//
// ⚠️ Sécurité (@qa, à durcir avant la rue) : pour le prototype, le compte-device peut
// être un compte à droits d'écriture (super_user/manager). À terme : un rôle `device`
// dédié + une policy d'INSERT minimale (sessions/plays de SA Kiosk uniquement).

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

  /** La Kiosk est-elle branchée sur Supabase (config présente + client) ? */
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

  /** Remonte l'état vivant de la Kiosk : version logicielle + dernier contact (F3). */
  async reportHeartbeat(version: string): Promise<void> {
    if (!supabase || !this.cfg) return;
    const { error } = await supabase
      .from("booths")
      .update({ software_version: version, last_heartbeat_at: new Date().toISOString() })
      .eq("id", this.cfg.boothId);
    if (error) console.error("[booth] heartbeat :", error.message);
  }

  /**
   * Updater embarqué (F10, prototype) : applique les déploiements en attente pour CETTE Kiosk
   * dont la fenêtre est échue. Ne pouvant pas swapper le code d'une web-app, on SIMULE
   * l'application (statut → `applied`, version Kiosk = version de la release). Le vrai
   * updater embarqué (télécharger/redémarrer/watchdog/rollback) viendra avec le déploiement OS.
   * Renvoie la version courante après application.
   */
  async applyPendingUpdates(currentVersion: string): Promise<string> {
    if (!supabase || !this.cfg) return currentVersion;
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("booth_updates")
      .select("id,release_id,status,scheduled_for")
      .eq("booth_id", this.cfg.boothId)
      .in("status", ["pending", "scheduled"]);
    const due = ((data ?? []) as Array<{ id: string; release_id: string; scheduled_for: string | null }>).filter((u) => !u.scheduled_for || u.scheduled_for <= nowIso);
    if (due.length === 0) return currentVersion;

    const { data: rels } = await supabase.from("releases").select("id,version,created_at").in("id", due.map((u) => u.release_id));
    const byId = new Map(((rels ?? []) as Array<{ id: string; version: string; created_at: string }>).map((r) => [r.id, r]));

    let newVersion = currentVersion;
    let newest = 0;
    for (const u of due) {
      await supabase.from("booth_updates").update({ status: "applied", applied_at: nowIso }).eq("id", u.id);
      const rel = byId.get(u.release_id);
      if (rel) {
        const t = new Date(rel.created_at).getTime();
        if (t >= newest) { newest = t; newVersion = rel.version; }
      }
    }
    await supabase.from("booths").update({ software_version: newVersion, last_heartbeat_at: nowIso }).eq("id", this.cfg.boothId);
    console.info(`[booth] MAJ appliquée${due.length > 1 ? ` (${due.length})` : ""} → version ${newVersion}`);
    return newVersion;
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

  /**
   * Enforcement des droits (F15, CIN-010) : renvoie les `media_id` à EXCLURE du catalogue de
   * CETTE Kiosk — licence expirée / pas encore valide, Kiosk non autorisée, ou plafond de
   * séances atteint (par Kiosk ou org-wide). Calculé côté serveur (fonction `security definer`
   * `blocked_media_for_booth`) : la borne n'a pas besoin de lire licences/plays.
   */
  async loadBlockedMedia(): Promise<Set<string>> {
    if (!supabase || !this.cfg) return new Set();
    const { data, error } = await supabase.rpc("blocked_media_for_booth", { p_booth: this.cfg.boothId });
    if (error) {
      console.error("[booth] enforcement droits :", error.message);
      return new Set(); // en cas d'erreur, ne pas bloquer le parcours (fail-open côté produit)
    }
    return new Set(((data ?? []) as Array<{ media_id: string }>).map((r) => String(r.media_id)));
  }

  /** Remonte une séance close + ses lectures. Fire-and-forget (n'interrompt pas le parcours). */
  async saveSession(snapshot: { session: Session; plays: readonly Play[] }): Promise<void> {
    if (!supabase || !this.cfg) return;
    const s = snapshot.session;
    // Id généré CÔTÉ BORNE : on n'a pas besoin de relire la ligne (RETURNING), ce qui
    // évite d'exiger une policy SELECT sur `sessions` pour le device (droits minimaux, CIN-002).
    const sessionId = crypto.randomUUID();
    const { error } = await supabase
      .from("sessions")
      .insert({
        id: sessionId,
        organization_id: this.cfg.orgId,
        booth_id: this.cfg.boothId,
        started_at: new Date(s.startedAt).toISOString(),
        ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        share_token: s.shareToken,
        unlock_method: s.unlockMethod,
        amount_cents: s.amount != null ? Math.round(s.amount) : null,
        payment_provider_ref: s.paymentProviderRef,
      });
    if (error) {
      console.error("[booth] remontée séance :", error.message);
      return;
    }
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
