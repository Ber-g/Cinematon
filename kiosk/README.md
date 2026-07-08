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
physique. L'agent expose déjà `POST /system/os-update` (apt update && upgrade, liste
blanche) et `GET /system/os-update/status` (nombre de paquets en attente).

Reste à construire (design) :
- **Canal de commande** back-office → borne : table `os_update_commands` (ou extension du
  modèle `booth_updates`) — cible (borne/parc), fenêtre, statut (`pending`/`running`/
  `done`/`failed`), horodatage ⇒ **migration à appliquer par Beranger**.
- Le `booth-client` (déjà authentifié device) **relaie** : lit les commandes dues, appelle
  l'agent local, remonte le statut + le journal. RLS : commande scopée org/borne,
  écriture réservée `global_admin` (la plateforme décide des patchs), lecture device.
- Dashboard : bouton **« Mettre à jour l'OS »** par borne / parc + état des patchs en attente.

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
via l'agent ; absent (dev navigateur) ⇒ stubs (mock). Ce petit serveur local (à packager
avec le front) est le seul à lire le jeton sur disque — il reste hors du bundle public.

## État

- ✅ Agent local (Wi-Fi/power/display/volume/system-info + os-update) + systemd + provisioning + sécurité.
- ✅ **Câblage `booth-client`** : `setup/kioskAgent.ts` (client + `AgentWifiAdapter` + réglages
  réels), `main.ts` bascule agent vs stubs selon `/kiosk-config.json`. Build vert.
- ✅ **Serveur local** `server/server.mjs` (Node natif, 127.0.0.1) : sert le build `booth-client`
  à Chromium **et** `/kiosk-config.json` (jeton lu au runtime, hors bundle ; même origine, pas de
  CORS). Anti-traversal vérifié. Service `kioskoscope-web.service`. ⏳ Reste = **vérif sur borne réelle**
  (déployer le build dans `KIOSK_WEB_ROOT`).
- ⏳ **CIN-077** : canal de commande MAJ OS (migration + relais booth-client + UI dashboard).
