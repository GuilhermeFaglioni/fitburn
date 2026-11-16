#!/usr/bin/env bash
# Valida a imagem da landing: nginx -t, healthz, 404, headers/CSP/cache e envsubst
# nos modos noindex e indexável. Uso: scripts/verify-landing-image.sh [imagem]
set -uo pipefail
IMG="${1:-fitburn-landing:ci}"
FAIL=0
ok() { echo "ok   $1"; }
bad() { echo "FALHA $1"; FAIL=1; }
expect() { # descrição, texto, padrão
  if grep -qiE -- "$3" <<<"$2"; then ok "$1"; else bad "$1 (esperava /$3/)"; fi
}
refute() {
  if grep -qiE -- "$3" <<<"$2"; then bad "$1 (não esperava /$3/)"; else ok "$1"; fi
}
# Só os cabeçalhos da resposta (GET, corpo descartado): evita bytes nulos de
# imagens/gzip na substituição de comando.
hdr() { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
body() { curl -s "$@"; }
status() { # descrição, cabeçalhos, código esperado; mostra a linha de status se falhar
  if grep -qE "^HTTP/[0-9.]+ $3( |$)" <<<"$2"; then ok "$1"; else bad "$1 (esperava $3, veio: $(head -1 <<<"$2"))"; fi
}

run_mode() { # nome, ROBOTS_TAG, ANALYTICS_ORIGIN
  local name="landing-$1" robots="$2" analytics="$3"
  docker rm -f "$name" >/dev/null 2>&1
  docker run -d --name "$name" -p 127.0.0.1::80 -e ROBOTS_TAG="$robots" -e ANALYTICS_ORIGIN="$analytics" "$IMG" >/dev/null || { bad "$1: container não subiu"; return; }
  local port; port=$(docker port "$name" 80/tcp | head -1 | sed 's/.*://')
  local url="http://127.0.0.1:$port"
  for _ in $(seq 1 30); do curl -fs "$url/healthz" >/dev/null && break; sleep 1; done

  echo "== modo $1 =="
  local out; out=$(docker exec "$name" nginx -t 2>&1); echo "$out" | tail -2
  expect "$1: nginx -t" "$out" "test is successful"
  local conf; conf=$(docker exec "$name" cat /etc/nginx/conf.d/snippets/security-headers.conf /etc/nginx/conf.d/default.conf)
  # Só placeholder de template ($VAR ou ${VAR}) conta; o nome da variável em comentário é legítimo.
  refute "$1: sem placeholder de template no conf gerado" "$conf" '\$\{?(ANALYTICS_ORIGIN|ROBOTS_TAG)\}?'
  expect "$1: \$uri preservado pelo envsubst" "$conf" 'try_files \$uri'

  local h
  h=$(hdr "$url/healthz"); status "$1: healthz 200" "$h" 200
  expect "$1: healthz corpo" "$(body "$url/healthz")" '^ok'
  h=$(hdr "$url/"); status "$1: home 200" "$h" 200
  expect "$1: home no-cache" "$h" '^cache-control: no-cache'
  expect "$1: CSP" "$h" "^content-security-policy: default-src 'self'"
  expect "$1: CSP frame-ancestors" "$h" "frame-ancestors 'none'"
  expect "$1: X-Frame-Options" "$h" '^x-frame-options: DENY'
  expect "$1: nosniff" "$h" '^x-content-type-options: nosniff'
  expect "$1: Referrer-Policy" "$h" '^referrer-policy: strict-origin'
  expect "$1: Permissions-Policy" "$h" '^permissions-policy:'
  refute "$1: sem versão do nginx" "$h" '^server: nginx/'
  if [ -n "$robots" ]; then expect "$1: X-Robots-Tag" "$h" "^x-robots-tag: $robots"; else refute "$1: sem X-Robots-Tag" "$h" '^x-robots-tag:'; fi
  if [ -n "$analytics" ]; then expect "$1: CSP com analytics" "$h" "script-src 'self' $analytics"; else refute "$1: CSP sem origem de analytics" "$h" "script-src 'self' https://"; fi
  expect "$1: home é HTML" "$(body "$url/")" '</html>'

  h=$(hdr "$url/nao-existe"); status "$1: 404" "$h" 404
  expect "$1: 404 com headers" "$h" '^x-frame-options: DENY'
  expect "$1: 404 usa a página própria" "$(body "$url/nao-existe")" '</html>'
  h=$(hdr "$url/creditos/"); status "$1: /creditos/ 200" "$h" 200
  h=$(hdr "$url/creditos"); status "$1: /creditos 200" "$h" 200
  expect "$1: /creditos/ é HTML" "$(body "$url/creditos/")" '</html>'

  local asset; asset=$(docker exec "$name" sh -c 'cd /usr/share/nginx/html && find _astro -type f | head -1')
  h=$(hdr "$url/$asset"); expect "$1: /_astro imutável" "$h" '^cache-control: public, max-age=31536000, immutable'
  h=$(hdr "$url/og.png"); expect "$1: og.png 1 dia" "$h" '^cache-control: public, max-age=86400'
  h=$(hdr "$url/robots.txt"); status "$1: robots.txt 200" "$h" 200
  h=$(hdr -H 'Accept-Encoding: gzip' "$url/"); expect "$1: gzip" "$h" '^content-encoding: gzip'
  docker rm -f "$name" >/dev/null
}

run_mode noindex "noindex, nofollow" ""
run_mode indexavel "" "https://analytics.example.com"
if [ "$FAIL" = 0 ]; then echo "TUDO OK"; else echo "HÁ FALHAS"; exit 1; fi
