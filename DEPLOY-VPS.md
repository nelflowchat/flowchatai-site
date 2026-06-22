# Hébergement du site sur le VPS Hostinger (Traefik v3 + Docker)

> flowchatai.co est servi depuis le VPS Hostinger, en conteneur `nginx:alpine`, derrière le Traefik
> existant (celui de n8n), avec certificat Let's Encrypt automatique. Migration réalisée le 22 juin 2026
> (avant : Netlify). Ce document est le runbook réel, validé.

## Contexte du VPS
- IP : `187.124.54.252` (IPv6 `2a02:4780:7:1897::1`), hôte `srv1566778.hstgr.cloud`, Ubuntu 24.04.
- Reverse proxy : **Traefik v3** en `network_mode: host`, provider Docker (`exposedbydefault=false`).
  - Entrypoints : `web` (:80, redirige tout vers HTTPS) et `websecure` (:443).
  - Certresolver : `letsencrypt` (challenge HTTP-01).
  - Compose Traefik : `/docker/traefik/docker-compose.yml`. Conteneur : `traefik-traefik-1`.
- n8n : `/docker/n8n-euwq/docker-compose.yml`, conteneur `n8n-euwq-n8n-1`, domaine
  `n8n-euwq.olymp-automations.cloud`. (Les 9 workflows du projet vivent ici.)

---

## 1. Récupérer le site sur le VPS
```bash
mkdir -p /docker/flowchatai-site
git clone https://github.com/nelflowchat/flowchatai-site.git /docker/flowchatai-site/html
```

## 2. Service du site (compose)
`/docker/flowchatai-site/docker-compose.yml` :
```yaml
services:
  flowchatai-site:
    image: nginx:alpine
    container_name: flowchatai-site
    restart: unless-stopped
    volumes:
      - /docker/flowchatai-site/html:/usr/share/nginx/html:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.flowchatai.rule=Host(`flowchatai.co`) || Host(`www.flowchatai.co`)"
      - "traefik.http.routers.flowchatai.entrypoints=websecure"
      - "traefik.http.routers.flowchatai.tls.certresolver=letsencrypt"
      - "traefik.http.services.flowchatai.loadbalancer.server.port=80"
```

> PIÈGE Traefik v3 : la règle multi-domaines s'écrit avec `||`, PAS avec une virgule. La forme
> `Host(\`a\`,\`b\`)` (valide en Traefik v2) provoque une erreur de parsing en v3 et un `404 page not found`.

## 3. Démarrer
```bash
cd /docker/flowchatai-site && docker compose up -d
```

## 4. Tester en local (avant DNS)
```bash
curl -sk -H "Host: flowchatai.co" https://localhost/ | head
```
Doit renvoyer le HTML du site (`<!DOCTYPE html> ... <title>FlowChatAI ...`). Si `404 page not found`,
c'est la règle Traefik (voir le piège v3 ci-dessus).

## 5. Bascule DNS (Hostinger : hPanel → Domaines → flowchatai.co → Zone DNS)
Ne toucher QUE le web. Laisser MX, TXT (SPF/DMARC), CNAME `hostingermail-*` (DKIM), autoconfig/autodiscover.

| Action | Type | Nom | Valeur |
|---|---|---|---|
| Modifier | A | `@` | `75.2.60.5` → `187.124.54.252` |
| Supprimer | CNAME | `www` | `...netlify.app` |
| Ajouter | A | `www` | `187.124.54.252` |

Il n'y avait pas d'AAAA sur l'apex (l'IPv6 de www venait du CNAME Netlify, supprimé avec lui).

## 6. Forcer l'émission du certificat (étape clé)
Traefik tente l'obtention du certificat AVANT que le DNS ait basculé, échoue (Let's Encrypt valide
alors sur l'ancienne IP Netlify → 404), et ne réessaie pas tout de suite. Une fois le DNS propagé vers
le VPS (`dig flowchatai.co +short` = `187.124.54.252`), forcer une nouvelle tentative :
```bash
docker restart traefik-traefik-1
sleep 40
docker logs traefik-traefik-1 2>&1 | grep -iE "flowchatai|acme|error" | tail -20
```
Le certificat s'émet alors via le challenge HTTP. ATTENTION : Let's Encrypt limite les tentatives
ÉCHOUÉES par heure. Ne relancer la commande qu'une fois le DNS confirmé propagé.

## 7. Vérifier
```bash
curl -sI https://flowchatai.co/        # HTTP/2 200, server: nginx
curl -sI https://www.flowchatai.co/    # HTTP/2 200
```
Puis dans le navigateur : cadenas "La connexion est sécurisée", émetteur Let's Encrypt, site + pages
légales + bulle Lucy OK.

---

## Mises à jour du site
Le contenu est un clone git monté en lecture seule, nginx sert à chaud :
```bash
cd /docker/flowchatai-site/html && git pull
```
Automatisation possible : un workflow n8n "webhook GitHub (push) → exec git pull" déploie tout seul.

## Rollback
Réversible côté DNS : remettre l'enregistrement A `@` (et `www`) sur `75.2.60.5` (Netlify). Garder le
site Netlify actif 24-48h après la bascule, le temps de valider le VPS, puis on peut le supprimer.

## Mémo des écueils rencontrés
- Traefik v3 : règle multi-hôtes avec `||` (la virgule casse → 404).
- ACME échoue tant que le DNS pointe vers l'ancien hôte ; après propagation, redémarrer Traefik.
- Ne jamais toucher MX / TXT / DKIM pendant la bascule (emails).
