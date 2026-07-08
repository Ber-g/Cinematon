#!/usr/bin/env bash
# Kioskoscope — émet un certificat CLIENT pour UNE borne (mTLS, CIN-078), signé par la CA.
# Chaque borne a un cert unique → révocable individuellement. Usage :
#   ./issue-kiosk-cert.sh <kiosk-id>        (ex. PERCHOIR-CAB001)
set -euo pipefail
CA_DIR="${CA_DIR:-./ca}"
OUT_DIR="${OUT_DIR:-./certs}"
DAYS="${CERT_DAYS:-825}"        # < 825 j = limite navigateur pour un cert
ID="${1:?usage: issue-kiosk-cert.sh <kiosk-id>}"
# Validation stricte de l'id (évite toute injection dans le sujet / les chemins).
[[ "$ID" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { echo "id invalide : alphanumérique / . _ - , max 64." >&2; exit 2; }
[[ -f "$CA_DIR/fleet-ca.key" ]] || { echo "CA introuvable ($CA_DIR) — lancez make-ca.sh d'abord." >&2; exit 1; }
umask 077
mkdir -p "$OUT_DIR"
key="$OUT_DIR/$ID.key"; csr="$OUT_DIR/$ID.csr"; crt="$OUT_DIR/$ID.crt"; p12="$OUT_DIR/$ID.p12"
openssl ecparam -name prime256v1 -genkey -noout -out "$key"
openssl req -new -key "$key" -subj "/O=Kioskoscope/CN=kiosk:$ID" -out "$csr"
# EKU clientAuth uniquement : ce cert authentifie un CLIENT, il ne peut pas servir de cert serveur.
openssl x509 -req -in "$csr" -CA "$CA_DIR/fleet-ca.crt" -CAkey "$CA_DIR/fleet-ca.key" \
  -CAcreateserial -sha256 -days "$DAYS" \
  -extfile <(printf 'extendedKeyUsage=clientAuth\nkeyUsage=critical,digitalSignature') -out "$crt"
# Bundle .p12 (clé + cert + CA) pour import dans le magasin de la borne (mot de passe demandé).
openssl pkcs12 -export -inkey "$key" -in "$crt" -certfile "$CA_DIR/fleet-ca.crt" -name "kiosk:$ID" -out "$p12"
rm -f "$csr"
echo "✓ Cert client émis pour la borne $ID :"
echo "  $crt / $key  ·  bundle à provisionner : $p12"
