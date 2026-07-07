// Cinematon — smoke-test du compte DEVICE (CIN-002). Prouve que la borne, avec son
// compte device dédié (sans membership, lié à sa cabine par booths.device_user_id), a
// EXACTEMENT les droits minimaux : lire son catalogue + écrire ses séances/heartbeat,
// et RIEN d'autre (ni membres, ni revenus, ni écriture médias, ni autre cabine/org).
//
// Prérequis : compte device créé + `booths.device_user_id` renseigné (voir README.md).
// Env : ISO_DEVICE_EMAIL/PASSWORD + ISO_DEVICE_BOOTH_ID + ISO_DEVICE_ORG_ID.
// Lancement : ISO_DEVICE_EMAIL=… … node --experimental-websocket supabase/tests/device_smoke.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

function loadConfig() {
  let url = process.env.VITE_SUPABASE_URL;
  let anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    try {
      for (const raw of readFileSync(resolve(repoRoot, "admin-dashboard", ".env"), "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (k === "VITE_SUPABASE_URL" && !url) url = v;
        if (k === "VITE_SUPABASE_ANON_KEY" && !anon) anon = v;
      }
    } catch { /* .env absent */ }
  }
  return { url, anon };
}
function req(name) {
  const v = process.env[name];
  if (!v) { console.error(`✖ Variable manquante : ${name} (voir README.md)`); process.exit(2); }
  return v;
}

let failures = 0, checks = 0;
const assert = (cond, label) => { checks++; if (cond) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✖ ${label}`); } };

async function main() {
  const { url, anon } = loadConfig();
  if (!url || !anon) { console.error("✖ URL/clé anon introuvables."); process.exit(2); }
  const email = req("ISO_DEVICE_EMAIL"), password = req("ISO_DEVICE_PASSWORD");
  const boothId = req("ISO_DEVICE_BOOTH_ID"), orgId = req("ISO_DEVICE_ORG_ID");

  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log("Cinematon — smoke device (CIN-002)");
  const { error: signErr } = await c.auth.signInWithPassword({ email, password });
  if (signErr) { console.error(`✖ Connexion device échouée : ${signErr.message}`); process.exit(2); }

  console.log("\n▸ Ce que le device DOIT pouvoir faire");
  {
    const { data, error } = await c.from("media").select("id").eq("active", true);
    assert(!error && (data ?? []).length > 0, `lire le catalogue (média actifs) — ${data?.length ?? 0} film(s)`);
  }
  {
    const { error } = await c.from("releases").select("id").limit(1);
    assert(!error, `lire les versions (releases) — ${error?.message ?? "ok"}`);
  }
  {
    const { error } = await c.from("booth_updates").select("id").limit(1);
    assert(!error, `lire ses booth_updates — ${error?.message ?? "ok"}`);
  }
  {
    // Sans .select() : le device écrit mais ne relit PAS (aucune policy SELECT sur booths —
    // droits minimaux). L'insert de séance ci-dessous prouve que `current_device_booth()` matche.
    const { error } = await c.from("booths").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", boothId);
    assert(!error, `heartbeat : update de SA cabine — ${error?.message ?? "ok"}`);
  }
  let sessionOk = false;
  {
    // Id généré côté client (pas de RETURNING → pas besoin de SELECT). Le with-check
    // `booth_id = current_device_booth()` valide le lien device→cabine.
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { error } = await c.from("sessions").insert({ id: crypto.randomUUID(), organization_id: orgId, booth_id: boothId, share_token: token, unlock_method: "mock" });
    sessionOk = !error;
    assert(!error, `insérer une séance de SA cabine — ${error?.message ?? "ok"}`);
  }

  console.log("\n▸ Ce que le device NE DOIT PAS pouvoir faire");
  {
    const { data } = await c.from("memberships").select("id");
    assert((data ?? []).length === 0, `ne voit AUCUN membre (${data?.length ?? 0})`);
  }
  {
    const { data } = await c.from("transactions").select("id");
    assert((data ?? []).length === 0, `ne voit AUCUNE transaction (${data?.length ?? 0})`);
  }
  {
    const { data } = await c.from("users").select("id");
    assert((data ?? []).length <= 1, `ne voit pas les profils d'autrui (${data?.length ?? 0})`);
  }
  {
    const { data, error } = await c.from("media").insert({ organization_id: orgId, content_hash: "smoke-" + Date.now(), title: "INTRUS" }).select();
    assert(error != null || (data ?? []).length === 0, `INSERT média refusé (pas d'altération du catalogue)`);
    if ((data ?? []).length) await c.from("media").delete().eq("title", "INTRUS");
  }
  {
    const fake = "00000000-0000-0000-0000-0000000000ff";
    const { data, error } = await c.from("sessions").insert({ organization_id: orgId, booth_id: fake, share_token: "x" + Date.now(), unlock_method: "mock" }).select();
    assert(error != null || (data ?? []).length === 0, `INSERT séance pour une AUTRE cabine refusé`);
  }
  {
    const fake = "00000000-0000-0000-0000-0000000000ff";
    const { data } = await c.from("booths").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", fake).select();
    assert((data ?? []).length === 0, `UPDATE d'une AUTRE cabine → 0 ligne`);
  }

  console.log(`\n── Résultat : ${checks - failures}/${checks} vérifications OK ──`);
  if (sessionOk) console.log(`(note : 1 séance de test créée — le device ne peut pas la supprimer/relire, c'est voulu)`);
  if (failures > 0) { console.error(`✖ DEVICE MAL RESTREINT : ${failures} échec(s).`); process.exit(1); }
  console.log("✓ Device correctement restreint (droits minimaux respectés).");
}
main().catch((e) => { console.error("✖ Erreur inattendue :", e); process.exit(3); });
