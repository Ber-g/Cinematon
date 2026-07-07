// Smoke test DOM-free de l'auth opérateur OFFLINE (CIN-073). Exerce le hachage PIN et
// la vérification (chemins OK / mauvais PIN / inconnu / expiré / révoqué / non-énumération).
// Lancer : node_modules/.bin/esbuild booth-client/scripts/auth_smoke.ts --bundle \
//   --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
import {
  buildAccessEntry,
  hashPin,
  normalizeIdentifier,
  verifyOperator,
  type AccessTable,
} from "../src/setup/auth";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("ÉCHEC: " + msg);
  console.log("  ✓ " + msg);
}

async function main(): Promise<void> {
  console.log("1. Hachage PIN : déterministe par sel, sensible au PIN");
  const h1 = await hashPin("246810", "abcd", 1000);
  const h2 = await hashPin("246810", "abcd", 1000);
  const h3 = await hashPin("246811", "abcd", 1000);
  const h4 = await hashPin("246810", "ef01", 1000);
  assert(h1 === h2, "même PIN + même sel → même empreinte");
  assert(h1 !== h3, "PIN différent → empreinte différente");
  assert(h1 !== h4, "sel différent → empreinte différente");
  assert(/^[0-9a-f]{64}$/.test(h1), "empreinte = 32 octets hex");

  console.log("2. Construction d'une table d'accès");
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const table: AccessTable = {
    orgId: "org-a1",
    boothId: "booth-1",
    updatedAt: new Date().toISOString(),
    entries: [
      await buildAccessEntry({ identifier: "PERCHOIR-CAB001-OP", pin: "246810", role: "operator" }),
      await buildAccessEntry({ identifier: "PERCHOIR-CAB001-ADMIN", pin: "135790", role: "super_user" }),
      await buildAccessEntry({ identifier: "PERCHOIR-CAB001-OLD", pin: "000000", role: "operator", expiresAt: yesterday }),
      await buildAccessEntry({ identifier: "PERCHOIR-CAB001-EX", pin: "111111", role: "operator", revoked: true }),
    ],
  };
  assert(table.entries.every((e) => !("pin" in e)), "aucune entrée ne stocke le PIN en clair");
  assert(table.entries.every((e) => /^[0-9a-f]{64}$/.test(e.pinHash)), "chaque entrée a une empreinte hex");

  console.log("3. Vérification : chemin nominal");
  const ok = await verifyOperator(table, "PERCHOIR-CAB001-OP", "246810");
  assert(ok.ok && ok.role === "operator", "PIN correct → ok + rôle operator");
  const okAdmin = await verifyOperator(table, "PERCHOIR-CAB001-ADMIN", "135790");
  assert(okAdmin.ok && okAdmin.role === "super_user", "admin → rôle super_user");

  console.log("4. Tolérance de saisie sur l'identifiant");
  const okCase = await verifyOperator(table, "  perchoir-cab001-op ", "246810");
  assert(okCase.ok, "identifiant insensible à la casse/espaces");
  assert(normalizeIdentifier(" x-y ") === "X-Y", "normalizeIdentifier trim + upper");

  console.log("5. Chemins d'échec");
  const bad = await verifyOperator(table, "PERCHOIR-CAB001-OP", "000000");
  assert(!bad.ok && bad.reason === "invalid", "mauvais PIN → invalid");
  const unknown = await verifyOperator(table, "N-EXISTE-PAS", "246810");
  assert(!unknown.ok && unknown.reason === "invalid", "identifiant inconnu → invalid");

  console.log("6. Révoqué / expiré ne sont révélés qu'avec le bon PIN (anti-énumération)");
  const revokedGood = await verifyOperator(table, "PERCHOIR-CAB001-EX", "111111");
  assert(!revokedGood.ok && revokedGood.reason === "revoked", "révoqué + bon PIN → revoked");
  const revokedBad = await verifyOperator(table, "PERCHOIR-CAB001-EX", "999999");
  assert(!revokedBad.ok && revokedBad.reason === "invalid", "révoqué + mauvais PIN → invalid (pas revoked)");
  const expiredGood = await verifyOperator(table, "PERCHOIR-CAB001-OLD", "000000");
  assert(!expiredGood.ok && expiredGood.reason === "expired", "expiré + bon PIN → expired");
  const expiredBad = await verifyOperator(table, "PERCHOIR-CAB001-OLD", "222222");
  assert(!expiredBad.ok && expiredBad.reason === "invalid", "expiré + mauvais PIN → invalid (pas expired)");

  console.log("7. Fenêtre d'expiration");
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const tableFut: AccessTable = {
    ...table,
    entries: [await buildAccessEntry({ identifier: "T-OK", pin: "123456", role: "operator", expiresAt: future })],
  };
  const stillValid = await verifyOperator(tableFut, "T-OK", "123456");
  assert(stillValid.ok, "expiration future → encore valide");

  console.log("\nTOUS LES INVARIANTS OK");
}

main().catch((e: unknown) => {
  console.error("\n" + (e as Error).message);
  process.exit(1);
});
