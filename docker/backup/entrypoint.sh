#!/bin/sh
set -eu

configuration_error() {
  printf '[backup] configuração inválida: %s\n' "$1" >&2
  exit 1
}

require_value() {
  [ -n "$2" ] || configuration_error "$1 é obrigatório"
}

require_value PGHOST "${PGHOST:-}"
require_value PGPORT "${PGPORT:-}"
require_value PGUSER "${PGUSER:-}"
require_value PGPASSWORD "${PGPASSWORD:-}"
require_value PGDATABASE "${PGDATABASE:-}"
require_value BACKUP_DESTINATION "${BACKUP_DESTINATION:-}"
require_value BACKUP_STORAGE_ENDPOINT "${BACKUP_STORAGE_ENDPOINT:-}"
require_value BACKUP_STORAGE_REGION "${BACKUP_STORAGE_REGION:-}"
require_value BACKUP_STORAGE_ACCESS_KEY_ID "${BACKUP_STORAGE_ACCESS_KEY_ID:-}"
require_value BACKUP_STORAGE_SECRET_ACCESS_KEY "${BACKUP_STORAGE_SECRET_ACCESS_KEY:-}"
require_value BACKUP_AGE_RECIPIENT "${BACKUP_AGE_RECIPIENT:-}"
require_value BACKUP_HEARTBEAT_URL "${BACKUP_HEARTBEAT_URL:-}"

case "$BACKUP_DESTINATION" in
  s3://?*)
    s3_location=${BACKUP_DESTINATION#s3://}
    [ -n "${s3_location%%/*}" ] || configuration_error "BACKUP_DESTINATION precisa incluir bucket S3"
    ;;
  file:///*) ;;
  *) configuration_error "BACKUP_DESTINATION deve usar s3:// ou file:///" ;;
esac

case "$BACKUP_STORAGE_ENDPOINT" in
  http://?*|https://?*) ;;
  *) configuration_error "BACKUP_STORAGE_ENDPOINT precisa usar http:// ou https://" ;;
esac

case "$BACKUP_HEARTBEAT_URL" in
  http://?*|https://?*) ;;
  *) configuration_error "BACKUP_HEARTBEAT_URL precisa usar http:// ou https://" ;;
esac

if ! printf '' | age -r "$BACKUP_AGE_RECIPIENT" >/dev/null 2>&1; then
  configuration_error "BACKUP_AGE_RECIPIENT não é um recipient age válido"
fi

export RCLONE_CONFIG_FITBURN_TYPE=s3
export RCLONE_CONFIG_FITBURN_PROVIDER=Other
export RCLONE_CONFIG_FITBURN_ACCESS_KEY_ID="$BACKUP_STORAGE_ACCESS_KEY_ID"
export RCLONE_CONFIG_FITBURN_SECRET_ACCESS_KEY="$BACKUP_STORAGE_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_FITBURN_ENDPOINT="$BACKUP_STORAGE_ENDPOINT"
export RCLONE_CONFIG_FITBURN_REGION="$BACKUP_STORAGE_REGION"
export RCLONE_CONFIG_FITBURN_FORCE_PATH_STYLE=true

exec "$@"
