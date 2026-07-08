// Kioskoscope — serveur local de la borne (CIN-071, couche de service front).
//
// Deux rôles, sur 127.0.0.1 uniquement :
//   1. sert le build statique du `booth-client` à Chromium (kiosk) ;
//   2. sert `GET /kiosk-config.json` avec le jeton de l'agent LU AU RUNTIME depuis
//      /etc/kioskoscope/agent.token — jamais compilé dans le bundle (principe F17).
//
// Le jeton n'est exposé que sur la boucle locale, même origine que le front (pas d'en-tête
// CORS) : seul le booth-client servi ici peut le lire, pas une page d'une autre origine.
// Node natif, aucune dépendance : se déploie avec `node server.mjs`.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.KIOSK_WEB_PORT ?? 8080);
const WEB_ROOT = process.env.KIOSK_WEB_ROOT ?? "/opt/kioskoscope/booth-client/dist";
const AGENT_URL = process.env.KIOSK_AGENT_URL ?? "http://127.0.0.1:4599";
const TOKEN_FILE = process.env.KIOSK_AGENT_TOKEN_FILE ?? "/etc/kioskoscope/agent.token";
// Creds Supabase du device (boothId/orgId/deviceEmail/devicePassword), provisionnés en local.
// Fournis au runtime au booth-client → JAMAIS dans le bundle (un build public reste inerte).
const DEVICE_FILE = process.env.KIOSK_DEVICE_FILE ?? "/etc/kioskoscope/device.json";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".vtt": "text/vtt",
};

/** Jeton de l'agent, relu à chaque requête (suit une rotation sans redémarrage). */
function agentToken() {
  try {
    return readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

/** Creds device (fichier local 0600), relus à chaque requête. null si non provisionné. */
function deviceConfig() {
  try {
    const d = JSON.parse(readFileSync(DEVICE_FILE, "utf8"));
    const ok = ["boothId", "orgId", "deviceEmail", "devicePassword"].every((k) => typeof d?.[k] === "string" && d[k] !== "");
    return ok ? { boothId: d.boothId, orgId: d.orgId, deviceEmail: d.deviceEmail, devicePassword: d.devicePassword } : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  let path = decodeURIComponent(url.pathname);

  // Config borne : jeton au runtime, hors bundle, non caché, même origine seulement.
  if (path === "/kiosk-config.json") {
    const token = agentToken();
    const device = deviceConfig();
    res.writeHead(token ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(
      JSON.stringify(
        token
          ? { agentUrl: AGENT_URL, agentToken: token, ...(device ? { device } : {}) }
          : { error: "jeton indisponible" },
      ),
    );
    return;
  }

  // Statique : anti-traversal (le chemin résolu doit rester sous WEB_ROOT).
  if (path === "/" || path === "") path = "/index.html";
  const file = join(WEB_ROOT, normalize(path));
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + "/")) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    // Repli SPA : toute route inconnue → index.html.
    try {
      const idx = await readFile(join(WEB_ROOT, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(idx);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
});

server.listen(PORT, HOST, () => {
  console.info(`[web] Kioskoscope front sur http://${HOST}:${PORT} (racine ${WEB_ROOT})`);
});
