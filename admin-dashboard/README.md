# Kioskoscope — admin-dashboard

Back-office de gestion de la flotte de Kiosks. Vue d'ensemble de l'état des
Kiosks (santé, indicateurs, télémétrie), détail par Kiosk, outils opérateur
(journaux, redémarrage, push de contenu) et gestion des données (ajout/édition).

Stack : **Vite + TypeScript** + **[Tabler](https://tabler.io)** (design system,
Bootstrap 5) + **[Gridstack](https://gridstackjs.com)** (widgets déplaçables).
Données **mock** pour l'instant (préfigurent le futur backend `fleet-api`).

## Lancer en local

```bash
cd admin-dashboard
npm install
npm run dev            # http://127.0.0.1:5174
```

## Deux rôles

- **Opérateur** — voit toutes les Kiosks + tous les outils (journaux,
  redémarrage à distance, push de contenu, suppression).
- **Gérant de bar** — ne voit que ses Kiosks, sans les outils techniques/debug.

La bascule de rôle est dans la barre du haut (menu du nom). Le choix est mémorisé.

## Éditable

- **Données** : bouton « Ajouter une Kiosk » + « Modifier » dans le détail d'une
  Kiosk (nom, emplacement, statut, version, notes). Modifications persistées en
  `localStorage`.
- **Disposition** : bouton « Éditer la disposition » → les tuiles KPI deviennent
  déplaçables/redimensionnables (Gridstack). La disposition est mémorisée.

## Statuts de santé (exclusifs)

`Opérationnel` · `Attention` · `En panne` · `Hors-ligne` · `Maintenance` —
chacun avec une couleur **et** une icône **et** un libellé (jamais la couleur
seule). Les indicateurs (sous tension, en cours d'utilisation, mise à jour) sont
cumulables et orthogonaux à la santé.

## Structure

```
src/
  domain/   types (Booth, statuts, rôles) + mapping des statuts
  data/     données mock + store (CRUD + persistance localStorage)
  ui/       app (shell + vue d'ensemble + Gridstack), composants, drawer, form
  main.ts   boot (import Tabler/Gridstack + montage)
```

## À venir

Remplacer les données mock par des appels au backend `fleet-api` ; suivi des
téléversements de vidéos vers les Kiosks (barres de progression).
