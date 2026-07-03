// Smoke test DOM-free : exerce le cœur logique (mock unlock + reco + session)
// comme le fait le parcours, sans navigateur. Vérifie les invariants clés.
// Lancer : node_modules/.bin/esbuild scripts/smoke.ts --bundle --platform=node \
//   --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
import { activeCatalog, availableMoods } from "../src/domain/catalog";
import { RuleBasedRecommender } from "../src/reco/RuleBasedRecommender";
import { SessionManager, generateShareToken } from "../src/session/SessionManager";
import { MockUnlockAdapter } from "../src/unlock/MockUnlockAdapter";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("ÉCHEC: " + msg);
  console.log("  ✓ " + msg);
}

async function main(): Promise<void> {
  console.log("1. Déverrouillage forcé succès puis échecs");
  const ok = await new MockUnlockAdapter({ forcedStatus: "success", delayMs: 1 }).startUnlock();
  assert(ok.status === "success" && ok.method === "mock" && ok.amount === null, "mock success = gratuit");
  for (const s of ["refused", "timeout", "abandoned"] as const) {
    const r = await new MockUnlockAdapter({ forcedStatus: s, delayMs: 1 }).startUnlock();
    assert(r.status === s, `mock simule l'échec '${s}'`);
  }

  console.log("2. share_token : entropie et unicité");
  const t1 = generateShareToken();
  const t2 = generateShareToken();
  assert(t1 !== t2, "deux tokens diffèrent");
  assert(/^[A-Za-z0-9_-]{20,}$/.test(t1), "token base64url ~128 bits, non séquentiel");

  console.log("3. Session multi-films + Play.source");
  const sm = new SessionManager("booth-test");
  const session = sm.start("mock", null, null);
  assert(session.shareToken.length > 0 && !("filmId" in (session as object)), "Session sans film_id, avec token");

  const reco = new RuleBasedRecommender();
  const moods = availableMoods();
  assert(moods.length > 0, `humeurs disponibles: ${moods.join(", ")}`);

  const q = { mood: "apaisant", maxDurationSeconds: 600 };
  let recommended = reco.recommend(activeCatalog(), { alreadyPlayed: sm.currentPlays, query: q });
  assert(recommended.length > 0, "reco non vide pour apaisant/<10min");
  assert(recommended.every((f) => f.durationSeconds <= 600), "reco respecte la durée max");
  assert(recommended[0]!.moods.includes("apaisant"), "top reco correspond à l'humeur");

  const first = recommended[0]!;
  const play1 = sm.recordPlayStart(first, "recommendation");
  sm.markPlayCompleted(play1.id);
  recommended = reco.recommend(activeCatalog(), { alreadyPlayed: sm.currentPlays, query: q });
  assert(!recommended.some((f) => f.id === first.id), "film déjà vu exclu de la reco suivante");

  const second = recommended[0]!;
  sm.recordPlayStart(second, "user_choice");
  assert(sm.currentPlays.length === 2, "2 plays enregistrés");
  assert(
    sm.currentPlays[0]!.source === "recommendation" && sm.currentPlays[1]!.source === "user_choice",
    "sources correctes (North Star)",
  );
  assert(sm.currentPlays[0]!.position === 0 && sm.currentPlays[1]!.position === 1, "positions ordonnées");

  console.log("4. Clôture de session");
  const snap = sm.end();
  assert(snap.session.endedAt !== null && snap.plays.length === 2, "session clôturée avec 2 plays");
  assert(sm.current === null, "plus de session active après end()");

  console.log("\nTOUS LES INVARIANTS OK");
}

main().catch((e: unknown) => {
  console.error("\n" + (e as Error).message);
  process.exit(1);
});
