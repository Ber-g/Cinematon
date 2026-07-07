# Kioskoscope — booth-client

Application kiosque : le parcours vécu par le spectateur dans la Kiosk. Écran
d'accueil → déverrouillage → choix par humeur/durée → recommandation → lecture
(plusieurs films) → récap + QR de partage.

Stack : **Vite + TypeScript vanilla** (aucun framework UI). Tourne dans une fenêtre
navigateur sur Mac en dev, et en Chromium `--kiosk` sur la machine dédiée en prod —
sans réécriture.

## Lancer en local (Mac)

```bash
cd booth-client
npm install
npm run dev
```

Puis ouvrir l'URL affichée (http://127.0.0.1:5173). Pour tester en plein écran :
mettre le navigateur en plein écran (F11 / ⌃⌘F).

> ⚠️ Le serveur de dev ne doit **jamais** être exposé sur le réseau (rester en
> `127.0.0.1`) — advisory esbuild connu, sans effet sur le build de production.

## Build de production (machine dédiée)

```bash
npm run build     # tsc --noEmit + vite build → dist/ (statique)
npm run preview   # sert dist/ pour vérifier
```

`dist/` est un ensemble de fichiers statiques (`base: "./"`) : servable depuis
n'importe quel chemin, à afficher en Chromium `--kiosk`.

## Vérifier la logique (sans navigateur)

```bash
node_modules/.bin/esbuild scripts/smoke.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
```

## Points d'extension (sans toucher au parcours)

Tout est câblé dans `src/main.ts` — c'est le **seul** endroit qui choisit les
implémentations concrètes :

- **Déverrouillage** — remplacer `MockUnlockAdapter` par un `CardUnlockAdapter`
  (Stripe Terminal) / `CoinUnlockAdapter` en implémentant `UnlockAdapter`.
- **Recommandation** — remplacer `RuleBasedRecommender` par tout autre moteur
  implémentant `Recommender`. Aucune ligne d'UI à modifier.
- **Catalogue** — `src/domain/catalog.ts` contient un catalogue **factice** à
  remplacer par le vrai (mêmes champs : `tmdbId`, `genres`, `moods`, `tags`,
  `durationSeconds`). Déposer les fichiers vidéo dans `public/media/` et renseigner
  `storageUrl` ; sinon la lecture est **simulée** (aucun fichier requis pour tester).

## Structure

```
src/
  domain/     types (Film/Session/Play) + catalogue factice
  unlock/     UnlockAdapter (interface) + MockUnlockAdapter
  reco/       Recommender (interface) + RuleBasedRecommender
  session/    SessionManager (multi-films, share_token CSPRNG)
  ui/         app.ts (state machine) + screens.ts + dom.ts
  main.ts     câblage des implémentations concrètes
```
