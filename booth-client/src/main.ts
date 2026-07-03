import "./styles.css";
import { RuleBasedRecommender } from "./reco/RuleBasedRecommender";
import { SessionManager } from "./session/SessionManager";
import { MockUnlockAdapter } from "./unlock/MockUnlockAdapter";
import { App } from "./ui/app";

// Point d'entrée. C'est ICI, et nulle part ailleurs, qu'on choisit les
// implémentations concrètes (adaptateur de déverrouillage, moteur de reco).
// Pour brancher un vrai paiement : remplacer MockUnlockAdapter par un
// CardUnlockAdapter, sans toucher au parcours.

const root = document.getElementById("app");
if (!root) throw new Error("Élément #app introuvable");

const BOOTH_ID = "booth-proto-01";

const app = new App(
  root,
  new MockUnlockAdapter(), // mock : simule succès ET échecs
  new RuleBasedRecommender(), // reco prototype : règles sur métadonnées
  new SessionManager(BOOTH_ID),
  {
    boothId: BOOTH_ID,
    shareBaseUrl: "https://cinematon.app",
    endAutoReturnMs: 45_000,
    afterFilmCountdownSeconds: 60, // 1 min max pour choisir après un film
  },
);

app.start();
