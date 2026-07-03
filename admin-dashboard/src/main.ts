// Feuilles de style : Tabler (design system), Gridstack (widgets), nos ajustements.
import "@tabler/core/dist/css/tabler.min.css";
import "gridstack/dist/gridstack.min.css";
import "./styles.css";

import { FleetStore } from "./data/store";
import { App } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("Élément #app introuvable");

const store = new FleetStore();
const app = new App(root, store);
app.render();
