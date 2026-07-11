# Kiosk — base système de la borne

Runtime et administration d'une borne Kioskoscope physique. Cible : **Debian/Linux +
Chromium en mode kiosk**. Couvre CIN-071 (services locaux) et CIN-077 (MAJ OS pilotée
back-office). Volet A opérateur = `booth-client` ; ici = la couche **système** sous lui.

## Architecture

```
┌─────────────────────────── Borne (Debian) ───────────────────────────┐
│                                                                        │
│  Chromium --kiosk  ──►  booth-client (web app)                         │
│        │                     │  menu opérateur (PIN offline)           │
│        │                     ▼                                         │
│        │            HTTP 127.0.0.1:4599  (jeton Bearer)                │
│        │                     │                                         │
│        │                     ▼                                         │
│  agent local (node)  ──►  nmcli / systemctl / apt / backlight         │
│   (systemd, user `kiosk`)      via sudoers LISTE BLANCHE               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
        ▲                                   ▲
        │ watchdog (Restart=always)         │ commandes MAJ OS (CIN-077)
        └── kioskoscope-kiosk.service       └── back-office (dashboard)
```

- **`agent/agent.mjs`** — service local (Node natif, zéro dépendance). Expose au menu
  les actions système réelles et applique les MAJ OS. Écoute **127.0.0.1 seulement**.
- **`systemd/`** — `kioskoscope-agent.service` (l'agent) + `kioskoscope-kiosk.service`
  (Chromium plein écran, `Restart=always` = watchdog anti-écran-figé, F4).
- **`provisioning/`** — `setup.sh` (install idempotente), `sudoers-kioskoscope` (liste
  blanche), `kiosk-brightness` (seul écrivain du backlight).

## Modèle de sécurité (@qa — non négociable)

Principe F17 : **une compromission de la web-app ne doit JAMAIS donner root.**

1. **Isolation app ↔ système.** L'agent n'est pilotable qu'avec un **jeton Bearer**
   (`/etc/kioskoscope/agent.token`, 0600) que seule la borne de confiance porte — pas
   un contenu web arbitraire. Écoute **loopback only** : inatteignable du réseau.
2. **Aucun shell.** Toutes les commandes passent par `execFile` (arguments = tableau),
   entrées validées → pas d'injection (SSID/mot de passe passés en argv à `nmcli`).
3. **Privilège minimal.** L'utilisateur `kiosk` n'a de `sudo` que sur une **liste
   blanche exhaustive** (`apt-get update/upgrade`, `systemctl restart kiosk`/`reboot`,
   `kiosk-brightness <int>`). `rm`, `bash`, éditeurs, etc. = refusés.
4. **Traçabilité.** Chaque action est journalisée (`/var/log/kioskoscope-agent.log`,
   qui/quoi/quand ; jamais le mot de passe Wi-Fi) — destinée à remonter au back-office.

## MAJ OS depuis le back-office (CIN-077) — sécurité des patchs

Objectif : **pas de faille locale qui traîne** — le parc reste patché sans intervention
physique. L'agent expose `POST /system/os-update` (apt update && upgrade, liste blanche →
renvoie la queue de sortie + paquets restants) et `GET /system/os-update/status`.

Câblage livré (CIN-077) :
- **Canal de commande** `os_update_commands` (migration `0017`) — une commande par borne,
  statut `pending`/`running`/`done`/`failed`, journal apt, horodatage. RLS : lecture org,
  **écriture humaine réservée `global_admin`** (la plateforme décide des patchs), device
  lit + met à jour SA borne. Index partiel unique = une seule commande active par borne.
  ⇒ **migration `0017` à appliquer par Beranger.**
- Le `booth-client` (authentifié device) **relaie** (`backend.relayOsUpdates` + poll 5 min) :
  lit les commandes `pending` de sa borne, appelle l'agent local, remonte `running` →
  `done`/`failed` + le journal apt.
- Dashboard (page Maintenance → « État des Kiosks ») : bouton **« MAJ OS »** par borne et
  **« Mettre à jour l'OS du parc »** (global_admin), colonne d'état des patchs.

⚠️ **À trancher** : politique d'auto-patch sécurité (ex. `unattended-upgrades` pour les
MAJ critiques automatiques) vs 100 % piloté back-office. Recommandation @cto : **les deux**
— `unattended-upgrades` pour les CVE critiques (filet), pilotage back-office pour le reste.

## Déploiement (résumé)

```bash
# le repo déployé dans /opt/kioskoscope, en root :
sudo /opt/kioskoscope/kiosk/provisioning/setup.sh
# puis, quand l'affichage X + le front servi en local sont prêts :
sudo systemctl enable --now kioskoscope-kiosk.service
```

## Injection du jeton (hors bundle) — `/kiosk-config.json`

Le `booth-client` (dans Chromium) ne peut pas lire `/etc/kioskoscope/agent.token`, et le
jeton **ne doit pas** être compilé dans le bundle (sinon un contenu web compromis aurait le
privilège système). Solution : la **couche de service locale** qui sert le front à Chromium
sert aussi, au runtime, un `GET /kiosk-config.json` :

```json
{ "agentUrl": "http://127.0.0.1:4599", "agentToken": "<contenu de /etc/kioskoscope/agent.token>" }
```

`booth-client` le lit au démarrage (`loadKioskConfig`) : présent ⇒ Wi-Fi/réglages **réels**
via l'agent ; absent (dev navigateur) ⇒ stubs (mock). Ce petit serveur local est le seul à lire
les secrets sur disque — ils restent hors du bundle public.

**Creds device (Supabase) au runtime aussi (sécu 2026-07-08).** `/kiosk-config.json` inclut, si
provisionné, un objet `device` (`boothId`/`orgId`/`deviceEmail`/`devicePassword`) lu depuis
`/etc/kioskoscope/device.json` (0600). Le `booth-client` n'embarque donc PLUS ces creds dans le
bundle : un build public reste **inerte** (mode mock). En dev, repli sur `.env` (`import.meta.env.DEV`).

## État

- ✅ Agent local (Wi-Fi/power/display/volume/system-info + os-update) + systemd + provisioning + sécurité.
- ✅ **Câblage `booth-client`** : `setup/kioskAgent.ts` (client + `AgentWifiAdapter` + réglages
  réels), `main.ts` bascule agent vs stubs selon `/kiosk-config.json`. Build vert.
- ✅ **Serveur local** `server/server.mjs` (Node natif, 127.0.0.1) : sert le build `booth-client`
  à Chromium **et** `/kiosk-config.json` (jeton lu au runtime, hors bundle ; même origine, pas de
  CORS). Anti-traversal vérifié. Service `kioskoscope-web.service`. ⏳ Reste = **vérif sur borne réelle**
  (déployer le build dans `KIOSK_WEB_ROOT`).
- ✅ **CIN-077** : canal de commande MAJ OS livré (migration `0017` + relais `booth-client` +
  UI dashboard). ⏳ Reste = **appliquer `0017`** puis valider sur borne réelle (agent apt).
