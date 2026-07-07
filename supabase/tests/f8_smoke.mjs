// Cinematon — smoke-test F8 (backend) : vérifie de bout en bout ce que le dashboard
// médias vient d'activer, avec une session super_user RÉELLE (RLS active) :
//   - Storage : upload + suppression d'un objet sous les policies `0003` (chemin {org}/{hash})
//   - media_instances : insert/lecture/suppression sous RLS (can_write_org)
//   - plays / storage_locations : lecture sans erreur + mini top-N
// Tout est nettoyé en fin de test (aucune donnée résiduelle).
//
// Prérequis : compte super_user (réutilise ISO_A_EMAIL/ISO_A_PASSWORD de l'isolation).
// Lancement :
//   ISO_A_EMAIL=… ISO_A_PASSWORD=… node --experimental-websocket supabase/tests/f8_smoke.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

function loadSupabaseConfig() {
  let url = process.env.VITE_SUPABASE_URL;
  let anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    try {
      const envPath = resolve(repoRoot, "admin-dashboard", ".env");
      for (const raw of readFileSync(envPath, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "VITE_SUPABASE_URL" && !url) url = val;
        if (key === "VITE_SUPABASE_ANON_KEY" && !anon) anon = val;
      }
    } catch {
      /* .env absent */
    }
  }
  return { url, anon };
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`✖ Variable manquante : ${name} (voir supabase/tests/README.md).`);
    process.exit(2);
  }
  return v;
}

let failures = 0;
let checks = 0;
function assert(cond, label) {
  checks += 1;
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✖ ${label}`);
  }
}

async function main() {
  const { url, anon } = loadSupabaseConfig();
  if (!url || !anon) {
    console.error("✖ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY introuvables.");
    process.exit(2);
  }
  const email = requireEnv("ISO_A_EMAIL");
  const password = requireEnv("ISO_A_PASSWORD");

  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log("Cinematon — smoke-test F8 (backend)");
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) {
    console.error(`✖ Connexion échouée (${email}) : ${signErr.message}`);
    process.exit(2);
  }

  // Contexte : une cabine + un média visibles (RLS → org de l'utilisateur).
  const { data: booths } = await client.from("booths").select("id, organization_id").limit(1);
  const booth = booths?.[0];
  const { data: media } = await client.from("media").select("id, organization_id, content_hash").limit(1);
  const mediaRow = media?.[0];
  if (!booth || !mediaRow) {
    console.error("✖ Prérequis : il faut au moins 1 cabine et 1 média dans l'org du compte (seed.sql).");
    process.exit(2);
  }
  const org = booth.organization_id;
  console.log(`Org ${org} · booth ${booth.id} · media ${mediaRow.id}`);

  // 1. Lectures sans erreur des tables F8.
  console.log("\n▸ Lecture des tables F8");
  {
    const { error } = await client.from("storage_locations").select("id").limit(1);
    assert(!error, `select storage_locations (${error?.message ?? "ok"})`);
  }
  {
    const { error } = await client.from("media_instances").select("id").limit(1);
    assert(!error, `select media_instances (${error?.message ?? "ok"})`);
  }
  {
    const { data, error } = await client.from("plays").select("media_id");
    assert(!error, `select plays (${error?.message ?? "ok"})`);
    const counts = new Map();
    for (const p of data ?? []) counts.set(p.media_id, (counts.get(p.media_id) ?? 0) + 1);
    console.log(`    · ${data?.length ?? 0} lecture(s), ${counts.size} média(s) distinct(s)`);
  }

  // 2. media_instances : insert / présence / cleanup, via un support temporaire.
  console.log("\n▸ Envoi batch (media_instances) sous RLS");
  let tmpLocId = null;
  let tmpInstId = null;
  {
    const { data, error } = await client
      .from("storage_locations")
      .insert({ organization_id: org, booth_id: booth.id, type: "local", label: "SMOKE-TEST" })
      .select("id");
    tmpLocId = data?.[0]?.id ?? null;
    assert(!error && tmpLocId, `création support temporaire (${error?.message ?? "ok"})`);
  }
  if (tmpLocId) {
    const { data, error } = await client
      .from("media_instances")
      .insert({ organization_id: org, media_id: mediaRow.id, storage_location_id: tmpLocId })
      .select("id");
    tmpInstId = data?.[0]?.id ?? null;
    assert(!error && tmpInstId, `insert media_instance (${error?.message ?? "ok"})`);

    const { data: check } = await client.from("media_instances").select("id").eq("storage_location_id", tmpLocId);
    assert((check ?? []).length === 1, `présence media_instance vérifiée`);
  }
  // Cleanup (ordre : instance puis support).
  if (tmpInstId) await client.from("media_instances").delete().eq("id", tmpInstId);
  if (tmpLocId) {
    const { error } = await client.from("storage_locations").delete().eq("id", tmpLocId);
    assert(!error, `cleanup support temporaire (${error?.message ?? "ok"})`);
  }

  // 3. Storage : upload + delete sous les policies 0003 (chemin {org}/{hash}).
  console.log("\n▸ Storage (bucket privé `media`, policies 0003)");
  {
    const path = `${org}/smoke-${Date.now()}`;
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/octet-stream" });
    const up = await client.storage.from("media").upload(path, blob, { upsert: true });
    assert(!up.error, `upload ${path} (${up.error?.message ?? "ok"})`);
    if (!up.error) {
      const del = await client.storage.from("media").remove([path]);
      assert(!del.error, `suppression de l'objet (${del.error?.message ?? "ok"})`);
    } else if (/bucket|not found/i.test(up.error.message)) {
      console.error("    → le bucket `media` existe-t-il ? applique supabase/migrations/0003_storage.sql.");
    }
  }

  console.log(`\n── Résultat : ${checks - failures}/${checks} vérifications OK ──`);
  if (failures > 0) {
    console.error(`✖ F8 backend : ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
  console.log("✓ F8 backend OK (storage upload/delete, media_instances, lectures).");
}

main().catch((e) => {
  console.error("✖ Erreur inattendue :", e);
  process.exit(3);
});
