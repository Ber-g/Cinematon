import type { Booth, CurrentIdentity, Media, OrgRole, User } from "../domain/types";
import { MOCK_BOOTHS, MOCK_MEMBERSHIPS, MOCK_ORGS, MOCK_USERS } from "./mockFleet";
import { isSupabaseConfigured, supabase } from "./supabase";
import { boothToRow, mediaToRow, rowToBooth, rowToMedia } from "./mappers";
import { sha256Hex } from "./hash";

// Store = cache en mémoire + couche d'accès aux données. Deux modes :
// - `mock`     : données factices + localStorage (sans backend).
// - `supabase` : données réelles ; l'ISOLATION est imposée par la RLS Postgres
//   (les requêtes ne renvoient déjà que les lignes autorisées).
// Les getters restent SYNCHRONES (lisent le cache) ; les écritures et le chargement
// sont async et déclenchent `emit()` → re-render.

const LS_BOOTHS = "cinematon.admin.booths.v2";
const LS_IDENTITY = "cinematon.admin.identity.v2";
const LS_LAYOUT = "cinematon.admin.layout.v1";

type Listener = () => void;

function mockIdentityFor(userId: string): CurrentIdentity {
  const user = MOCK_USERS.find((u) => u.id === userId) ?? (MOCK_USERS[0] as User);
  if (user.isGlobalAdmin) return { user, activeOrganizationId: null, role: null };
  const membership = MOCK_MEMBERSHIPS.find((m) => m.userId === user.id);
  return { user, activeOrganizationId: membership?.organizationId ?? null, role: membership?.role ?? null };
}

export class FleetStore {
  readonly mode: "mock" | "supabase" = isSupabaseConfigured ? "supabase" : "mock";
  private booths: Booth[] = [];
  private media: Media[] = [];
  private orgs: Array<{ id: string; name: string }> = [];
  private identity: CurrentIdentity | null = null;
  private authed = false;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ── Initialisation (async) ──────────────────────────────────────────────────
  async init(): Promise<void> {
    if (this.mode === "mock") {
      this.booths = this.loadMockBooths();
      this.orgs = MOCK_ORGS.map((o) => ({ id: o.id, name: o.name }));
      this.identity = mockIdentityFor(localStorage.getItem(LS_IDENTITY) ?? "user-admin");
      this.authed = true;
      this.emit();
      return;
    }
    const { data } = await supabase!.auth.getSession();
    if (data.session) await this.loadFromSupabase();
    else this.emit(); // pas de session → écran de connexion
  }

  // ── Auth (mode supabase) ────────────────────────────────────────────────────
  get needsAuth(): boolean {
    return this.mode === "supabase" && !this.authed;
  }
  async signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    await this.loadFromSupabase();
    return { ok: true };
  }
  async signOut(): Promise<void> {
    await supabase!.auth.signOut();
    this.authed = false;
    this.identity = null;
    this.booths = [];
    this.emit();
  }

  private async loadFromSupabase(): Promise<void> {
    const { data: userRes } = await supabase!.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      this.authed = false;
      this.emit();
      return;
    }
    // Profil + appartenances (la RLS n'expose que ce qui est autorisé).
    const { data: profile } = await supabase!.from("users").select("*").eq("id", uid).maybeSingle();
    const { data: memberships } = await supabase!.from("memberships").select("*").eq("user_id", uid);
    const isGlobal = Boolean(profile?.is_global_admin);
    const first = memberships?.[0];
    this.identity = {
      user: { id: uid, name: profile?.name ?? "", email: userRes.user?.email ?? "", isGlobalAdmin: isGlobal },
      activeOrganizationId: isGlobal ? null : (first?.organization_id ?? null),
      role: isGlobal ? null : ((first?.role as OrgRole) ?? null),
    };
    // Cabines + médias : la RLS scope déjà par organisation → on charge tel quel.
    const { data: booths } = await supabase!.from("booths").select("*");
    this.booths = (booths ?? []).map(rowToBooth);
    const { data: media } = await supabase!.from("media").select("*");
    this.media = (media ?? []).map(rowToMedia);
    const { data: orgs } = await supabase!.from("organizations").select("id,name");
    this.orgs = (orgs ?? []) as Array<{ id: string; name: string }>;
    await this.enrichBooths();
    this.authed = true;
    this.emit();
  }

  /**
   * Complète chaque cabine avec ses agrégats (non portés par `booths`) :
   * historique 14 j + sessions/bande passante du jour (daily_stats), revenu du
   * jour (transactions), journaux (alerts). Toutes ces requêtes sont scopées par
   * la RLS. Peu de requêtes groupées plutôt qu'une par cabine.
   */
  private async enrichBooths(): Promise<void> {
    if (this.booths.length === 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const sinceStr = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);

    interface StatRow { booth_id: string; date: string; sessions: number; bandwidth_mb: number }
    interface TxRow { booth_id: string; amount_cents: number; created_at: string }
    interface AlertRow { booth_id: string | null; severity: string; message: string; created_at: string }

    const [stats, tx, alerts] = await Promise.all([
      supabase!.from("daily_stats").select("booth_id,date,sessions,bandwidth_mb").gte("date", sinceStr),
      supabase!.from("transactions").select("booth_id,amount_cents,created_at"),
      supabase!.from("alerts").select("booth_id,severity,message,created_at").order("created_at", { ascending: false }),
    ]);
    const statRows = (stats.data ?? []) as StatRow[];
    const txRows = (tx.data ?? []) as TxRow[];
    const alertRows = (alerts.data ?? []) as AlertRow[];

    this.booths = this.booths.map((b) => {
      const history = statRows
        .filter((s) => s.booth_id === b.id)
        .sort((a, c) => (a.date < c.date ? -1 : 1))
        .map((s) => ({ date: s.date, sessions: s.sessions, bandwidthMb: s.bandwidth_mb }));
      const todayStat = statRows.find((s) => s.booth_id === b.id && s.date === todayStr);
      const revenueTodayCents = txRows
        .filter((t) => t.booth_id === b.id && t.created_at.slice(0, 10) === todayStr)
        .reduce((n, t) => n + t.amount_cents, 0);
      const logs = alertRows
        .filter((a) => a.booth_id === b.id)
        .map((a) => ({
          at: new Date(a.created_at).getTime(),
          level: (a.severity === "critical" ? "error" : a.severity) as "info" | "warn" | "error",
          message: a.message,
        }));
      return { ...b, history, sessionsToday: todayStat?.sessions ?? 0, revenueTodayCents, logs };
    });
  }

  // ── Identité / rôle ─────────────────────────────────────────────────────────
  get current(): CurrentIdentity | null {
    return this.identity;
  }
  get isGlobalAdmin(): boolean {
    return this.identity?.user.isGlobalAdmin ?? false;
  }
  /** Bascule d'identité — mode mock uniquement (démo). */
  switchUser(userId: string): void {
    if (this.mode !== "mock") return;
    this.identity = mockIdentityFor(userId);
    localStorage.setItem(LS_IDENTITY, userId);
    this.emit();
  }

  // ── Lecture (scopée) ────────────────────────────────────────────────────────
  visibleBooths(): Booth[] {
    // En mode supabase, la RLS a déjà filtré → tout le cache est visible.
    if (this.mode === "supabase") return [...this.booths];
    if (this.isGlobalAdmin) return [...this.booths];
    const orgId = this.identity?.activeOrganizationId;
    return orgId ? this.booths.filter((b) => b.organizationId === orgId) : [];
  }
  boothById(id: string): Booth | undefined {
    return this.visibleBooths().find((b) => b.id === id);
  }

  // ── Écriture ────────────────────────────────────────────────────────────────
  upsertBooth(booth: Booth): void {
    // Cache optimiste + persistance selon le mode.
    const idx = this.booths.findIndex((b) => b.id === booth.id);
    if (idx >= 0) this.booths[idx] = booth;
    else this.booths.push(booth);
    this.emit();
    if (this.mode === "mock") {
      this.persistMock();
    } else {
      void supabase!.from("booths").upsert(boothToRow(booth)).then(({ error }) => {
        if (error) console.error("upsertBooth:", error.message);
      });
    }
  }
  deleteBooth(id: string): void {
    this.booths = this.booths.filter((b) => b.id !== id);
    this.emit();
    if (this.mode === "mock") {
      this.persistMock();
    } else {
      void supabase!.from("booths").delete().eq("id", id).then(({ error }) => {
        if (error) console.error("deleteBooth:", error.message);
      });
    }
  }

  // ── Médias ──────────────────────────────────────────────────────────────────
  mediaList(): Media[] {
    return [...this.media];
  }
  organizations(): Array<{ id: string; name: string }> {
    return [...this.orgs];
  }

  /**
   * Ajoute un média. Si un fichier est fourni, calcule son SHA-256 (dedup +
   * intégrité) et le téléverse (Supabase Storage). Le doublon est refusé par la
   * base (`unique(organization_id, content_hash)`) → message clair.
   */
  async addMedia(input: Media, file: File | null): Promise<{ ok: boolean; error?: string }> {
    const contentHash = file ? await sha256Hex(file) : input.contentHash;

    if (this.mode === "mock") {
      if (this.media.some((m) => m.organizationId === input.organizationId && m.contentHash === contentHash)) {
        return { ok: false, error: "Doublon : ce fichier existe déjà dans cette organisation." };
      }
      this.media.push({ ...input, contentHash });
      this.emit();
      return { ok: true };
    }

    let storageUrl = input.storageUrl;
    if (file) {
      const path = `${input.organizationId}/${contentHash}`;
      const up = await supabase!.storage.from("media").upload(path, file, { upsert: false });
      if (up.error && !/already exists/i.test(up.error.message)) {
        return { ok: false, error: `Téléversement échoué : ${up.error.message}` };
      }
      storageUrl = path;
    }

    const { error } = await supabase!.from("media").insert(mediaToRow({ ...input, contentHash, storageUrl }));
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Doublon : ce fichier existe déjà dans cette organisation." };
      return { ok: false, error: error.message };
    }
    await this.loadFromSupabase();
    return { ok: true };
  }

  async updateMedia(m: Media): Promise<void> {
    if (this.mode === "mock") {
      const i = this.media.findIndex((x) => x.id === m.id);
      if (i >= 0) this.media[i] = m;
      this.emit();
      return;
    }
    const { error } = await supabase!.from("media").update(mediaToRow(m)).eq("id", m.id);
    if (error) console.error("updateMedia:", error.message);
    else await this.loadFromSupabase();
  }

  async deleteMedia(id: string): Promise<void> {
    if (this.mode === "mock") {
      this.media = this.media.filter((m) => m.id !== id);
      this.emit();
      return;
    }
    const { error } = await supabase!.from("media").delete().eq("id", id);
    if (error) console.error("deleteMedia:", error.message);
    else await this.loadFromSupabase();
  }

  // ── Disposition des widgets ─────────────────────────────────────────────────
  loadLayout(): unknown | null {
    const raw = localStorage.getItem(LS_LAYOUT);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  saveLayout(layout: unknown): void {
    localStorage.setItem(LS_LAYOUT, JSON.stringify(layout));
  }

  // ── Persistance mock ────────────────────────────────────────────────────────
  private persistMock(): void {
    localStorage.setItem(LS_BOOTHS, JSON.stringify(this.booths));
  }
  private loadMockBooths(): Booth[] {
    const raw = localStorage.getItem(LS_BOOTHS);
    if (raw) {
      try {
        return JSON.parse(raw) as Booth[];
      } catch {
        /* retombe sur le mock */
      }
    }
    return MOCK_BOOTHS.map((b) => structuredClone(b));
  }
}
