import "./styles.css";
import { RuleBasedRecommender } from "./reco/RuleBasedRecommender";
import { SessionManager } from "./session/SessionManager";
import { MockUnlockAdapter } from "./unlock/MockUnlockAdapter";
import { BoothBackend } from "./data/backend";
import { setCatalog } from "./domain/catalog";
import type { Play, Session } from "./domain/types";
import { App } from "./ui/app";

// Point d'entrée. C'est ICI, et nulle part ailleurs, qu'on choisit les implémentations
// concrètes (déverrouillage, reco) et qu'on branche — ou non — le backend Supabase :
// - config VITE présente (.env) → catalogue RÉEL de l'org + remontée des séances/plays.
// - sinon → catalogue factice + sessions en mémoire (parcours testable hors ligne).

const FALLBACK_BOOTH_ID = "booth-proto-01";
const FALLBACK_ORG_ID = "org-perchoir";
const BOOTH_VERSION = "0.3.0-proto"; // version logicielle de la cabine (remontée en heartbeat)

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Élément #app introuvable");

  const backend = new BoothBackend();
  let boothId = FALLBACK_BOOTH_ID;
  let organizationId = FALLBACK_ORG_ID;
  let sink: ((s: { session: Session; plays: readonly Play[] }) => void) | undefined;

  if (backend.isConfigured && (await backend.init())) {
    boothId = backend.boothId;
    organizationId = backend.organizationId;
    void backend.reportHeartbeat(BOOTH_VERSION); // remonte version + dernier contact
    const films = await backend.loadCatalog();
    if (films.length > 0) setCatalog(films);
    sink = (snapshot) => void backend.saveSession(snapshot);
    console.info(`[booth] branché Supabase · org ${organizationId} · ${films.length} film(s)`);
  } else {
    console.info("[booth] mode hors ligne (catalogue factice, sessions en mémoire)");
  }

  const app = new App(
    root,
    new MockUnlockAdapter(), // mock : simule succès ET échecs
    new RuleBasedRecommender(), // reco prototype : règles sur métadonnées
    new SessionManager(boothId, organizationId, sink),
    {
      boothId,
      shareBaseUrl: "https://cinematon.app",
      endAutoReturnMs: 45_000,
      afterFilmCountdownSeconds: 60, // 1 min max pour choisir après un film
    },
  );

  app.start();
}

void main();
