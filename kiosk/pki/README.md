# Accès flotte par mTLS — seules les bornes autorisées (CIN-078)

Objectif : que `kiosk.kioskoscope.com` ne réponde **qu'aux bornes provisionnées**, et rejette
tout le reste **au bord Cloudflare** (avant même de servir une page). Mécanisme : **mTLS** —
chaque borne présente un **certificat client** signé par une **CA privée de flotte** ; Cloudflare
exige un cert de cette CA sur le hostname.

> ⚠️ Les clés privées (`ca/`, `certs/`, `*.key`, `*.p12`) ne doivent **jamais** être committées
> (déjà exclues dans `.gitignore`). La clé racine de la CA reste **hors ligne** (coffre).

## 1. Créer la CA (une fois, sur une machine de confiance hors ligne)

```bash
cd kiosk/pki && ./make-ca.sh
# → ca/fleet-ca.crt (public, pour Cloudflare) + ca/fleet-ca.key (SECRET, hors ligne)
```

## 2. Émettre un certificat par borne

```bash
./issue-kiosk-cert.sh PERCHOIR-CAB001
# → certs/PERCHOIR-CAB001.p12 (clé+cert) à provisionner sur cette borne
```

Un cert **unique par borne** → révocable individuellement (voir §5).

## 3. Côté Cloudflare (ton infra — étapes manuelles)

1. **SSL/TLS → Client Certificates** (ou API Shield → mTLS) : **uploader `ca/fleet-ca.crt`**
   comme CA de confiance pour le mTLS.
2. Créer une **mTLS rule** / **WAF custom rule** sur `kiosk.kioskoscope.com` :
   « si `not cf.tls_client_auth.cert_verified` → **Block** » (ou renvoyer la page rigolote — QA à venir).
3. Vérifier : un `curl https://kiosk.kioskoscope.com` **sans** cert → bloqué ; **avec** le cert
   d'une borne (`--cert`/`--key`) → passe.

## 4. Provisionner le cert sur la borne (Debian + Chromium)

Import dans le magasin NSS de l'utilisateur `kiosk`, puis politique Chromium pour **présenter le
cert sans invite** :

```bash
# import du bundle .p12 (mot de passe demandé)
sudo -u kiosk pk12util -d sql:/home/kiosk/.pki/nssdb -i PERCHOIR-CAB001.p12

# politique managée : présenter automatiquement le cert pour le hostname flotte
sudo install -d /etc/chromium/policies/managed
cat | sudo tee /etc/chromium/policies/managed/kiosk-mtls.json <<'JSON'
{ "AutoSelectCertificateForUrls":
  [ "{\"pattern\":\"https://kiosk.kioskoscope.com\",\"filter\":{\"ISSUER\":{\"CN\":\"Kioskoscope Fleet CA\"}}}" ] }
JSON
```

## 5. Révoquer une borne

Retirer sa confiance = ré-émettre la liste des CA côté Cloudflare **sans** ce cert (ou activer une
CRL / short-lived certs à terme). À court terme : cert unique par borne + rotation de la CA si
compromission large.

## Notes @cto / @qa

- **Rappel** : depuis le serveur local (`kiosk/server`), les bornes servent le booth-client **en
  local** — l'endpoint public n'est nécessaire que pour un usage central (ex. OTA). S'il ne sert à
  rien, **le retirer** est encore plus simple que le mTLS. À trancher selon l'usage réel.
- **Indépendant de mTLS** : si un build public a déjà embarqué des **identifiants device**, le mTLS
  ne les « déleak » pas rétroactivement → **rotate le mot de passe device** (voir CIN-062 / sortir
  les creds du bundle).
