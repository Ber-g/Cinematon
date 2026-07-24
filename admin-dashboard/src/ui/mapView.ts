import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FleetStore } from "../data/store";
import { el } from "./dom";
import { t } from "../i18n";
import { healthMeta } from "../domain/status";

// Carte de la flotte (F11) : pastilles colorées par santé, popup label/lieu/adresse.
// Lecture seule ici ; la POSE de la pin se fait dans la fiche Kiosk (drawer).

const HEALTH_HEX: Record<string, string> = {
  operational: "#2fb344",
  attention: "#f59f00",
  error: "#d63939",
  offline: "#626976",
  maintenance: "#4299e1",
};

let fleetMap: L.Map | null = null;

export function mapPage(store: FleetStore): HTMLElement {
  const booths = store.visibleBooths();
  const geo = booths.filter((b) => b.gpsLat != null && b.gpsLng != null);
  const noGeo = booths.filter((b) => b.gpsLat == null || b.gpsLng == null);
  const mapDiv = el("div", { id: "fleet-map", style: "height: 68vh; border-radius: 8px; z-index: 0;" });
  return el("div", {}, [
    el("h2", { class: "page-title mb-1" }, [t("page.map")]),
    el("p", { class: "text-secondary mb-3" }, [
      `${geo.length} Kiosk(s) localisée(s)` + (noGeo.length ? ` · ${noGeo.length} sans coordonnées (posez la pin dans la fiche Kiosk).` : "."),
    ]),
    el("div", { class: "card" }, [el("div", { class: "card-body p-2" }, [mapDiv])]),
    noGeo.length
      ? el("div", { class: "text-secondary small mt-2" }, [`Sans localisation : ${noGeo.map((b) => b.label).join(", ")}`])
      : el("span", {}, []),
  ]);
}

/**
 * Init Leaflet APRÈS que le conteneur soit dans le DOM (appelé par App après render).
 * `onOpen` (optionnel) : ouvrir la cabine depuis son marqueur → entrée cohérente avec le reste
 * du dashboard (même tiroir que partout). Sans lui, le popup reste informatif (rétro-compatible).
 */
export function mountFleetMap(store: FleetStore, onOpen?: (id: string) => void): void {
  const container = document.getElementById("fleet-map");
  if (!container) return;
  if (fleetMap) { fleetMap.remove(); fleetMap = null; }
  const geo = store.visibleBooths().filter((b) => b.gpsLat != null && b.gpsLng != null);
  const map = L.map(container).setView([46.6, 2.5], 5); // centre France par défaut
  fleetMap = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  const pts: Array<[number, number]> = [];
  for (const b of geo) {
    const color = HEALTH_HEX[b.health] ?? "#626976";
    const marker = L.circleMarker([b.gpsLat as number, b.gpsLng as number], { radius: 9, color, fillColor: color, fillOpacity: 0.75, weight: 2 }).addTo(map);
    const lines = [b.label, b.venueType, b.address || b.location, healthMeta(b.health).label].filter((x) => x);
    // Popup en ÉLÉMENT (pas string) → un bouton « Gérer cette cabine » cliquable qui ouvre le tiroir.
    const popup = el("div", { class: "map-popup" }, [
      el("div", {}, lines.map((x, i) => el(i === 0 ? "strong" : "div", { class: i === 0 ? "" : "text-secondary small" }, [String(x)]))),
    ]);
    if (onOpen) {
      const manage = el("button", { class: "btn btn-sm btn-primary w-100 mt-2", type: "button" }, ["Gérer cette cabine"]);
      manage.addEventListener("click", () => onOpen(b.id));
      popup.append(manage);
    }
    marker.bindPopup(popup);
    pts.push([b.gpsLat as number, b.gpsLng as number]);
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3));
  setTimeout(() => map.invalidateSize(), 0);
}
