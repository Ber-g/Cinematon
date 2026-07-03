import type { Film } from "./types";

// ⚠️ CATALOGUE FACTICE — données de démonstration structurées à l'identique du
// vrai catalogue. Aucun de ces films n'existe : titres/tmdbId/durées inventés.
// Remplacer intégralement dès que le catalogue réel + métadonnées sont fournis.
// `storageUrl: null` => lecture simulée (aucun fichier requis pour tester le parcours).

export const FACTICE_CATALOG: readonly Film[] = [
  {
    id: "f-aurora",
    title: "Aurora",
    year: 2021,
    durationSeconds: 480, // 8 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900001,
    genres: ["drame", "contemplatif"],
    moods: ["apaisant", "mélancolique"],
    tags: ["nuit", "nature", "lent"],
    director: "Camille Roy",
    synopsis:
      "Une veilleuse de nuit traverse une ville endormie et croise, à l'aube, les fantômes de ses insomnies. Un poème visuel sur le passage du temps.",
    stills: [],
    learnMoreUrl: null,
  },
  {
    id: "f-court-circuit",
    title: "Court-Circuit",
    year: 2019,
    durationSeconds: 300, // 5 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900002,
    genres: ["comédie", "absurde"],
    moods: ["énergique", "léger"],
    tags: ["urbain", "rythmé", "dialogue"],
    director: "Nadia Belkacem",
    synopsis:
      "Cinq minutes, une panne d'ascenseur, deux inconnus et un quiproquo qui dérape. Une comédie électrique où chaque seconde compte.",
    stills: [],
    learnMoreUrl: null,
  },
  {
    id: "f-derniere-station",
    title: "Dernière Station",
    year: 2022,
    durationSeconds: 720, // 12 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900003,
    genres: ["thriller", "drame"],
    moods: ["tendu", "sombre"],
    tags: ["huis-clos", "nuit", "intense"],
    director: "Yohan Prévost",
    synopsis:
      "Dernier train, dernier quai. Un contrôleur et une voyageuse sans billet se livrent un duel psychologique jusqu'au terminus.",
    stills: [],
    learnMoreUrl: null,
  },
  {
    id: "f-papier",
    title: "Papier",
    year: 2020,
    durationSeconds: 240, // 4 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900004,
    genres: ["animation", "poétique"],
    moods: ["apaisant", "léger"],
    tags: ["sans-dialogue", "artisanal", "doux"],
    director: "Lior Amrani",
    synopsis:
      "Un origami prend vie et part à la recherche de la main qui l'a plié. Animation papier découpé, entièrement faite main, sans un mot.",
    stills: [],
    learnMoreUrl: null,
  },
  {
    id: "f-plein-soleil",
    title: "Plein Soleil",
    year: 2023,
    durationSeconds: 540, // 9 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900005,
    genres: ["comédie", "romance"],
    moods: ["énergique", "joyeux"],
    tags: ["été", "lumineux", "dialogue"],
    director: "Inès Fontaine",
    synopsis:
      "Une terrasse, un mois d'août, un serveur maladroit et une cliente qui revient chaque jour à la même heure. La romance d'un été, en neuf minutes.",
    stills: [],
    learnMoreUrl: null,
  },
  {
    id: "f-sous-la-cendre",
    title: "Sous la Cendre",
    year: 2018,
    durationSeconds: 660, // 11 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900006,
    genres: ["drame", "historique"],
    moods: ["mélancolique", "sombre"],
    tags: ["mémoire", "lent", "intense"],
    director: "Théo Marchand",
    synopsis:
      "Dans une maison vidée après un deuil, une femme retrouve des lettres brûlées à moitié. Ce qui reste de la cendre suffit-il à se souvenir ?",
    stills: [],
    learnMoreUrl: null,
  },
  {
    id: "f-vertige",
    title: "Vertige",
    year: 2022,
    durationSeconds: 180, // 3 min
    storageUrl: null,
    version: 1,
    active: true,
    tmdbId: 900007,
    genres: ["expérimental", "thriller"],
    moods: ["tendu", "énergique"],
    tags: ["court", "rythmé", "sans-dialogue"],
    director: "Sacha Novak",
    synopsis:
      "Trois minutes en apnée au bord du vide. Un montage vertigineux, sans dialogue, où l'image elle-même semble sur le point de tomber.",
    stills: [],
    learnMoreUrl: null,
  },
];

/** Films actifs uniquement — jamais recommander/jouer un film désactivé. */
export function activeCatalog(catalog: readonly Film[] = FACTICE_CATALOG): readonly Film[] {
  return catalog.filter((f) => f.active);
}

/** Ensemble des humeurs présentes dans le catalogue actif (pour l'écran de choix). */
export function availableMoods(catalog: readonly Film[] = FACTICE_CATALOG): readonly string[] {
  const set = new Set<string>();
  for (const f of activeCatalog(catalog)) for (const m of f.moods) set.add(m);
  return [...set].sort();
}

export function filmById(id: string, catalog: readonly Film[] = FACTICE_CATALOG): Film | undefined {
  return catalog.find((f) => f.id === id);
}
