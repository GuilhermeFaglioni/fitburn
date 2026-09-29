#!/bin/sh
# Roda no entrypoint da imagem oficial do nginx, ANTES do envsubst dos templates
# (/docker-entrypoint.d/20-envsubst-on-templates.sh). Escolhe qual template vira
# a configuração do servidor, conforme NGINX_MODE:
#
#   local  -> local.conf.template      HTTP puro, sem TLS (verificação local)
#   auto   -> tls.conf.template        se já existe certificado para $DOMAIN
#             bootstrap.conf.template  se ainda não existe (só HTTP, para o certbot emitir o primeiro)
#
# Depois da emissão do certificado, `docker compose restart nginx` troca o
# bootstrap pela configuração HTTPS (o runbook faz isso).
set -eu

SRC="${NGINX_TEMPLATE_SRC:-/opt/fitburn/nginx-templates}"
DEST="${NGINX_TEMPLATE_DEST:-/etc/nginx/templates}"
SNIPPETS="${NGINX_SNIPPETS_DEST:-/etc/nginx/snippets}"
CERT_DIR="${NGINX_CERT_DIR:-/etc/letsencrypt/live}"
MODE="${NGINX_MODE:-auto}"

case "$MODE" in
  local)
    chosen="local"
    ;;
  auto)
    if [ -z "${DOMAIN:-}" ]; then
      echo "select-config: DOMAIN não definido" >&2
      exit 1
    fi
    if [ -f "$CERT_DIR/$DOMAIN/fullchain.pem" ] && [ -f "$CERT_DIR/$DOMAIN/privkey.pem" ]; then
      chosen="tls"
    else
      chosen="bootstrap"
    fi
    ;;
  *)
    echo "select-config: NGINX_MODE inválido: $MODE (use auto ou local)" >&2
    exit 1
    ;;
esac

mkdir -p "$DEST" "$SNIPPETS"
cp "$SRC/common.inc" "$SNIPPETS/fitburn-common.inc"
cp "$SRC/api-proxy.inc" "$SNIPPETS/fitburn-api-proxy.inc"
rm -f "$DEST"/*.template
cp "$SRC/$chosen.conf.template" "$DEST/default.conf.template"
echo "select-config: usando a configuração '$chosen' (NGINX_MODE=$MODE)"
