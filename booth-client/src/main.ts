import "./styles.css";
import { RuleBasedRecommender } from "./reco/RuleBasedRecommender";
import { SessionManager } from "./session/SessionManager";
import { MockUnlockAdapter } from "./unlock/MockUnlockAdapter";
import { BoothBackend } from "./data/backend";
import { setCatalog } from "./domain/catalog";
import type { Play, Session } from "./domain/types";
import { App } from "./ui/app";
import { WifiManager } from "./setup/wifi";
import {
  EncryptedAccessStore,
  LocalStorageAccessJournal,
  LocalStorageAccessStore,
  seedDemoAccessTable,
  type AccessStore,
} from "./setup/accessCache";
import { OperatorMenu, type OperatorSettingsHooks } from "./setup/operatorMenu";

// Point d'entrée. C'est ICI, et nulle part ailleurs, qu'on choisit les implémentations
// concrètes (déverrouillage, reco) et qu'on branche — ou non — le backend Supabase :
// - config VITE présente (.env) → catalogue RÉEL de l'org + remontée des séances/plays.
// - sinon → catalogue factice + sessions en mémoire (parcours testable hors ligne).

const FALLBACK_BOOTH_ID = "booth-proto-01";
const FALLBACK_ORG_ID = "org-perchoir";
const BOOTH_VERSION = "0.3.0-proto"; // version logicielle de la Kiosk (remontée en heartbeat)

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Élément #app introuvable");

  const backend = new BoothBackend();
  let boothId = FALLBACK_BOOTH_ID;
  let organizationId = FALLBACK_ORG_ID;
  let online = false;
  let sink: ((s: { session: Session; plays: readonly Play[] }) => void) | undefined;

  if (backend.isConfigured && (await backend.init())) {
    online = true;
    boothId = backend.boothId;
    organizationId = backend.organizationId;
    await backend.reportHeartbeat(BOOTH_VERSION); // remonte version + dernier contact
    await backend.applyPendingUpdates(BOOTH_VERSION); // updater : applique les déploiements dus
    const films = await backend.loadCatalog();
    const blocked = await backend.loadBlockedMedia(); // droits F15 : exclure expiré / au plafond
    const playable = films.filter((f) => !blocked.has(f.id));
    if (playable.length > 0) setCatalog(playable);
    sink = (snapshot) => void backend.saveSession(snapshot);
    console.info(
      `[booth] branché Supabase · org ${organizationId} · ${playable.length} film(s)` +
        (blocked.size > 0 ? ` (${blocked.size} exclu(s) : droits/plafond)` : ""),
    );
  } else {
    console.info("[booth] mode hors ligne (catalogue factice, sessions en mémoire)");
  }

  // Base de l'URL de partage (QR de fin → /s/{token}). La page récap est servie par
  // Cloudflare Pages (le domaine functions.supabase.co neutralise le HTML). Définir
  // VITE_SHARE_BASE_URL sur l'URL Pages (…pages.dev) ; défaut = futur domaine public.
  const shareBaseUrl =
    (import.meta.env.VITE_SHARE_BASE_URL as string | undefined) ?? "https://my.kioskoscope.com";

  const app = new App(
    root,
    new MockUnlockAdapter(), // mock : simule succès ET échecs
    new RuleBasedRecommender(), // reco prototype : règles sur métadonnées
    new SessionManager(boothId, organizationId, sink),
    {
      boothId,
      shareBaseUrl,
      endAutoReturnMs: 45_000,
      afterFilmCountdownSeconds: 60, // 1 min max pour choisir après un film
    },
  );

  app.start();

  // ── Menu opérateur Kiosk (F17 volet A, CIN-070/073) ──────────────────────────
  // Surface de service par-dessus le parcours, gardée par une auth OFFLINE (PIN).
  // Wi-Fi/réglages/redémarrage = hooks (stubs en dev ; services locaux réels différés
  // CIN-071/072). La table d'accès viendra du back-office ; en DEV seulement on la
  // seed avec des comptes de démo (jamais en build de production).
  // Cache d'accès CHIFFRÉ au repos si la Kiosk est provisionnée (secret device dispo, S4) ;
  // sinon (dev sans config) repli localStorage clair pour la table de démo.
  const accessStore: AccessStore = backend.isConfigured
    ? await EncryptedAccessStore.create(backend.cacheSecret, boothId)
    : new LocalStorageAccessStore();
  const accessJournal = new LocalStorageAccessJournal();
  if (online) {
    // En ligne : rafraîchir le cache d'accès depuis le back-office (sync eventually
    // consistent : révocations/expirations effectives à ce moment) puis pousser le
    // journal bufferisé hors ligne. On ne draine QU'APRÈS un push réussi → zéro perte.
    const table = await backend.syncOperatorAccess();
    if (table) {
      accessStore.save(table);
      console.info(`[booth] table d'accès synchronisée · ${table.entries.length} accès`);
    }
    const pending = accessJournal.peek();
    if (pending.length > 0 && (await backend.pushAccessLog(pending))) {
      accessJournal.drain();
    }
  } else if (import.meta.env.DEV && !accessStore.load()) {
    // Repli DEV hors ligne uniquement : table de démo pour exercer le menu sans back-office.
    accessStore.save(await seedDemoAccessTable(organizationId, boothId));
    console.info("[booth] table d'accès de DÉMO chargée (dev) · op PIN 246810 / admin PIN 135790");
  }

  let volume = 70;
  let brightness = 100;
  const settings: OperatorSettingsHooks = {
    getVolume: () => volume,
    setVolume: (v) => {
      volume = v;
    },
    getBrightness: () => brightness,
    setBrightness: (v) => {
      brightness = v;
      // Effet tangible en dev : la vraie luminosité passera par un service local.
      document.documentElement.style.filter = v === 100 ? "" : `brightness(${v}%)`;
    },
    restart: () => {
      // Stub : sur la Kiosk réelle → service local (systemd/OS). En dev on recharge.
      console.info("[booth] redémarrage demandé (stub dev)");
      location.reload();
    },
  };

  const operator = new OperatorMenu({
    store: accessStore,
    journal: accessJournal,
    wifi: new WifiManager(),
    settings,
    status: () => ({ boothId, orgId: organizationId, version: BOOTH_VERSION, online }),
  });
  operator.attachRevealGesture(document.body);
}

void main();
