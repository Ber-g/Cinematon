// Smoke test DOM-free du modèle de focus (F14). Exerce la navigation de l'anneau
// (directionnel + bouclage), la validation (confirm → click), le retour (back), la
// synchro pointeur, et le mapping clavier → intentions. Aucun DOM réel : on injecte
// des éléments factices implémentant la surface utilisée par FocusRing.
// Lancer : node_modules/.bin/esbuild booth-client/scripts/focus_smoke.ts --bundle \
//   --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
import { FocusRing } from "../src/input/focusRing";
import { mapKeyToIntent } from "../src/input/sources/keyboard";
import { InputController, type InputSource } from "../src/input/InputController";
import type { Intent, IntentHandler } from "../src/input/intents";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("ÉCHEC: " + msg);
  console.log("  ✓ " + msg);
}

// Élément factice : uniquement la surface que FocusRing touche (classList.toggle,
// focus, scrollIntoView, click). Cast en HTMLElement pour le typage.
interface FakeEl {
  clicks: number;
  hasFocused: boolean;
  focus(opts?: unknown): void;
  scrollIntoView(opts?: unknown): void;
  click(): void;
  classList: { toggle(cls: string, on?: boolean): void };
}

function fakeEl(): FakeEl {
  const el: FakeEl = {
    clicks: 0,
    hasFocused: false,
    focus() {
      el.hasFocused = true;
    },
    scrollIntoView() {
      /* no-op */
    },
    click() {
      el.clicks += 1;
    },
    classList: {
      toggle(_cls: string, on?: boolean): void {
        el.hasFocused = on === true;
      },
    },
  };
  return el;
}

function asItems(els: readonly FakeEl[]): HTMLElement[] {
  return els as unknown as HTMLElement[];
}

function main(): void {
  console.log("1. Navigation directionnelle + bouclage");
  const a = fakeEl();
  const b = fakeEl();
  const c = fakeEl();
  const ring = new FocusRing({ items: asItems([a, b, c]) });
  assert(ring.focusedIndex === 0, "focus initial = index 0");
  ring.handle("down");
  assert(ring.focusedIndex === 1, "down → index 1");
  ring.handle("right");
  assert(ring.focusedIndex === 2, "right → index 2 (même sens que down)");
  ring.handle("down");
  assert(ring.focusedIndex === 0, "down depuis le dernier → boucle à 0");
  ring.handle("up");
  assert(ring.focusedIndex === 2, "up depuis 0 → boucle au dernier");
  ring.handle("left");
  assert(ring.focusedIndex === 1, "left → recule (même sens que up)");

  console.log("2. Validation : confirm clique l'élément focalisé, et lui seul");
  ring.handle("confirm");
  assert(b.clicks === 1, "confirm → click sur l'élément focalisé (b)");
  assert(a.clicks === 0 && c.clicks === 0, "aucun autre élément cliqué");

  console.log("3. Retour : back appelle onBack");
  let backs = 0;
  const ring2 = new FocusRing({ items: asItems([fakeEl()]), onBack: () => (backs += 1) });
  ring2.handle("back");
  assert(backs === 1, "back → onBack()");

  console.log("4. back sans onBack = no-op (pas d'exception)");
  const ring3 = new FocusRing({ items: asItems([fakeEl()]) });
  ring3.handle("back");
  assert(true, "back sans callback ne lève pas");

  console.log("5. Intentions média ignorées par l'anneau (pas de déplacement)");
  const mediaRing = new FocusRing({ items: asItems([fakeEl(), fakeEl()]) });
  for (const i of ["playPause", "stop", "volumeUp", "volumeDown"] as const) {
    mediaRing.handle(i as Intent);
  }
  assert(mediaRing.focusedIndex === 0, "les intentions média ne bougent pas le focus");

  console.log("6. Liste vide : robustesse");
  const empty = new FocusRing({ items: asItems([]) });
  assert(empty.focusedIndex === -1, "liste vide → focusedIndex -1");
  empty.handle("down");
  empty.handle("confirm");
  assert(true, "navigation/validation sur liste vide ne lève pas");

  console.log("7. syncTo : aligne l'index sur un élément (appui tactile)");
  const x = fakeEl();
  const y = fakeEl();
  const z = fakeEl();
  const ring4 = new FocusRing({ items: asItems([x, y, z]) });
  ring4.syncTo(z as unknown as HTMLElement);
  assert(ring4.focusedIndex === 2, "syncTo(z) → index 2");
  ring4.syncTo(fakeEl() as unknown as HTMLElement);
  assert(ring4.focusedIndex === 2, "syncTo d'un élément absent = no-op");

  console.log("8. initialIndex borné");
  const ring5 = new FocusRing({ items: asItems([fakeEl(), fakeEl()]), initialIndex: 99 });
  assert(ring5.focusedIndex === 1, "initialIndex hors borne → dernier élément");

  console.log("9. Mapping clavier → intentions");
  const cases: Array<[string, Intent | null]> = [
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["Enter", "confirm"],
    [" ", "confirm"],
    ["Escape", "back"],
    ["Backspace", "back"],
    ["MediaPlayPause", "playPause"],
    ["k", "playPause"],
    ["AudioVolumeUp", "volumeUp"],
    ["AudioVolumeDown", "volumeDown"],
    ["a", null],
    ["Tab", null],
  ];
  for (const [key, expected] of cases) {
    const got = mapKeyToIntent({ key } as KeyboardEvent);
    assert(got === expected, `touche « ${key} » → ${expected ?? "aucune"}`);
  }

  console.log("10. InputController : route vers le handler actif, re-route au changement");
  let emit: (i: Intent) => void = () => undefined;
  const source: InputSource = {
    attach(fn) {
      emit = fn;
      return () => {
        emit = () => undefined;
      };
    },
  };
  const rec = (): { seen: Intent[]; handler: IntentHandler } => {
    const seen: Intent[] = [];
    return { seen, handler: { handle: (i) => seen.push(i) } };
  };
  const controller = new InputController([source]);
  const screenA = rec();
  const screenB = rec();

  emit("confirm"); // aucun handler branché → ignoré sans erreur
  assert(screenA.seen.length === 0 && screenB.seen.length === 0, "sans handler : intention ignorée");

  controller.setHandler(screenA.handler);
  emit("down");
  emit("confirm");
  assert(screenA.seen.join(",") === "down,confirm", "handler A reçoit ses intentions");

  controller.setHandler(screenB.handler); // changement d'écran
  emit("back");
  assert(screenB.seen.join(",") === "back", "après changement, handler B reçoit");
  assert(screenA.seen.length === 2, "l'ancien handler A ne reçoit plus rien");

  controller.setHandler(undefined); // écran sans handler
  emit("up");
  assert(screenB.seen.length === 1, "setHandler(undefined) : plus personne n'écoute");

  controller.dispose(); // détache la source
  emit("down");
  assert(screenB.seen.length === 1, "après dispose, la source est détachée");

  console.log("\n✅ focus_smoke : tous les invariants F14 vérifiés");
}

main();
