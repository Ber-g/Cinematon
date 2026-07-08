#!/usr/bin/env bash
# Kioskoscope — crée la CA PRIVÉE de la flotte (mTLS, CIN-078).
# La clé racine reste HORS LIGNE (coffre / machine de confiance) : JAMAIS sur une borne,
# jamais dans le repo, jamais poussée. Seul le CERT public (fleet-ca.crt) est diffusé
# (uploadé chez Cloudflare pour valider les certs clients des bornes).
set -euo pipefail
CA_DIR="${CA_DIR:-./ca}"
DAYS="${CA_DAYS:-3650}"
umask 077
mkdir -p "$CA_DIR"
[[ -f "$CA_DIR/fleet-ca.key" ]] && { echo "CA déjà présente dans $CA_DIR — abandon (ne pas écraser)."; exit 1; }
openssl ecparam -name prime256v1 -genkey -noout -out "$CA_DIR/fleet-ca.key"
openssl req -x509 -new -key "$CA_DIR/fleet-ca.key" -sha256 -days "$DAYS" \
  -subj "/O=Kioskoscope/CN=Kioskoscope Fleet CA" -out "$CA_DIR/fleet-ca.crt"
echo "✓ CA créée."
echo "  Public (à uploader chez Cloudflare) : $CA_DIR/fleet-ca.crt"
echo "  PRIVÉ (à protéger hors ligne)       : $CA_DIR/fleet-ca.key"
