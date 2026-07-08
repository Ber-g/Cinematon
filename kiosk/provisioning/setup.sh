#!/usr/bin/env bash
# Kioskoscope — provisioning d'une borne Debian (base système, CIN-071).
# Idempotent : ré-exécutable sans casser une install existante. À lancer en root
# sur une Debian fraîche, le repo étant déployé dans /opt/kioskoscope.
set -euo pipefail

REPO="${KIOSK_REPO:-/opt/kioskoscope}"
KIOSK_USER="kiosk"

echo "→ Paquets de base"
apt-get update
apt-get install -y nodejs chromium network-manager lsb-release openssl

echo "→ Utilisateur applicatif ($KIOSK_USER) — sans privilèges hors liste blanche"
id -u "$KIOSK_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$KIOSK_USER"

echo "→ Jeton de l'agent (secret local, 0600) — inconnu de la web-app"
install -d -m 0755 /etc/kioskoscope
if [[ ! -s /etc/kioskoscope/agent.token ]]; then
  openssl rand -hex 32 > /etc/kioskoscope/agent.token
fi
chmod 0600 /etc/kioskoscope/agent.token
chown "$KIOSK_USER":"$KIOSK_USER" /etc/kioskoscope/agent.token

echo "→ Helper luminosité"
install -m 0755 "$REPO/kiosk/provisioning/kiosk-brightness" /usr/local/sbin/kiosk-brightness

echo "→ Liste blanche sudo (validée avant activation)"
install -m 0440 "$REPO/kiosk/provisioning/sudoers-kioskoscope" /etc/sudoers.d/kioskoscope
visudo -c

echo "→ Journal de l'agent"
install -m 0640 -o "$KIOSK_USER" -g "$KIOSK_USER" /dev/null /var/log/kioskoscope-agent.log 2>/dev/null || true

echo "→ Services systemd (agent + web + kiosk)"
install -m 0644 "$REPO/kiosk/systemd/kioskoscope-agent.service" /etc/systemd/system/
install -m 0644 "$REPO/kiosk/systemd/kioskoscope-web.service" /etc/systemd/system/
install -m 0644 "$REPO/kiosk/systemd/kioskoscope-kiosk.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kioskoscope-agent.service
# Le serveur web (front + /kiosk-config.json) suppose le build booth-client déployé
# dans KIOSK_WEB_ROOT (/opt/kioskoscope/booth-client/dist) — voir README.
if [[ -f /opt/kioskoscope/booth-client/dist/index.html ]]; then
  systemctl enable --now kioskoscope-web.service
else
  echo "  ⚠ booth-client/dist absent : déployez le build puis 'systemctl enable --now kioskoscope-web.service'"
fi
# Le service kiosk (Chromium) suppose un serveur X : à activer une fois l'affichage prêt.
echo "  (kiosk Chromium : 'systemctl enable --now kioskoscope-kiosk.service' quand l'affichage est prêt)"

echo "✓ Provisioning terminé. Agent local actif sur 127.0.0.1:4599."
