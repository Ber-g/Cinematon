// Feuilles de style : Tabler (design system), Gridstack (widgets), nos ajustements.
import "@tabler/core/dist/css/tabler.min.css";
import "gridstack/dist/gridstack.min.css";
import "./styles.css";

// Import de Bootstrap pour activer les data-API (dropdown de rôle, collapse de la
// barre latérale). Les composants pilotés à la main (Offcanvas, Modal) restent
// importés là où on les instancie.
import "bootstrap";

import { FleetStore } from "./data/store";
import { App } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("Élément #app introuvable");

const store = new FleetStore();
const app = new App(root, store);
app.render();
