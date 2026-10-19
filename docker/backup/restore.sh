#!/bin/sh
set -eu
set -o pipefail

fail() {
  printf '[restore] erro: %s\n' "$1" >&2
  exit 1
}

require_value() {
  [ -n "$2" ] || fail "$1 é obrigatório"
}

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--allow-nonempty" ]; }; then
  fail 'uso: restore.sh [--allow-nonempty]'
fi

allow_nonempty=false
if [ "$#" -eq 1 ]; then allow_nonempty=true; fi

require_value RESTORE_TARGET_DATABASE "${RESTORE_TARGET_DATABASE:-}"
require_value PGHOST "${PGHOST:-}"
require_value PGPORT "${PGPORT:-}"
require_value PGUSER "${PGUSER:-}"
require_value PGPASSWORD "${PGPASSWORD:-}"
require_value BACKUP_FILE "${BACKUP_FILE:-}"
require_value AGE_IDENTITY_FILE "${AGE_IDENTITY_FILE:-}"
[ -r "$AGE_IDENTITY_FILE" ] || fail 'AGE_IDENTITY_FILE não está legível'

require_value RESTORE_SOURCE_PGDATABASE "${RESTORE_SOURCE_PGDATABASE:-}"
[ "$RESTORE_TARGET_DATABASE" != "$RESTORE_SOURCE_PGDATABASE" ] \
  || fail 'RESTORE_TARGET_DATABASE precisa ser diferente do banco de origem'

verify_source=false
if [ -n "${RESTORE_SOURCE_PGHOST:-}${RESTORE_SOURCE_PGPORT:-}${RESTORE_SOURCE_PGUSER:-}${RESTORE_SOURCE_PGPASSWORD:-}" ]; then
  require_value RESTORE_SOURCE_PGHOST "${RESTORE_SOURCE_PGHOST:-}"
  require_value RESTORE_SOURCE_PGPORT "${RESTORE_SOURCE_PGPORT:-}"
  require_value RESTORE_SOURCE_PGUSER "${RESTORE_SOURCE_PGUSER:-}"
  require_value RESTORE_SOURCE_PGPASSWORD "${RESTORE_SOURCE_PGPASSWORD:-}"
  verify_source=true
fi

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT HUP INT TERM
encrypted_file="$workdir/backup.sql.gz.age"
compressed_file="$workdir/backup.sql.gz"

copy_backup() {
  case "$BACKUP_FILE" in
    file://*)
      source_file=${BACKUP_FILE#file://}
      [ -r "$source_file" ] || fail 'arquivo de backup não está legível'
      cp "$source_file" "$encrypted_file"
      ;;
    s3://*)
      require_value BACKUP_STORAGE_ENDPOINT "${BACKUP_STORAGE_ENDPOINT:-}"
      require_value BACKUP_STORAGE_REGION "${BACKUP_STORAGE_REGION:-}"
      require_value BACKUP_STORAGE_ACCESS_KEY_ID "${BACKUP_STORAGE_ACCESS_KEY_ID:-}"
      require_value BACKUP_STORAGE_SECRET_ACCESS_KEY "${BACKUP_STORAGE_SECRET_ACCESS_KEY:-}"
      s3_location=${BACKUP_FILE#s3://}
      case "$s3_location" in */*) ;; *) fail 'BACKUP_FILE S3 precisa incluir o caminho do arquivo' ;; esac
      bucket=${s3_location%%/*}
      key=${s3_location#*/}
      [ -n "$bucket" ] && [ -n "$key" ] || fail 'BACKUP_FILE S3 precisa incluir bucket e caminho do arquivo'
      export RCLONE_CONFIG_FITBURN_TYPE=s3
      export RCLONE_CONFIG_FITBURN_PROVIDER=Other
      export RCLONE_CONFIG_FITBURN_ACCESS_KEY_ID="$BACKUP_STORAGE_ACCESS_KEY_ID"
      export RCLONE_CONFIG_FITBURN_SECRET_ACCESS_KEY="$BACKUP_STORAGE_SECRET_ACCESS_KEY"
      export RCLONE_CONFIG_FITBURN_ENDPOINT="$BACKUP_STORAGE_ENDPOINT"
      export RCLONE_CONFIG_FITBURN_REGION="$BACKUP_STORAGE_REGION"
      export RCLONE_CONFIG_FITBURN_FORCE_PATH_STYLE=true
      rclone copyto "fitburn:$bucket/$key" "$encrypted_file" --quiet
      ;;
    *) fail 'BACKUP_FILE deve usar file:// ou s3://' ;;
  esac
}

copy_backup
age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$compressed_file" "$encrypted_file"
gzip --test "$compressed_file"

target_psql() {
  psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname "$RESTORE_TARGET_DATABASE" "$@"
}

source_psql() {
  PGHOST="$RESTORE_SOURCE_PGHOST" \
    PGPORT="$RESTORE_SOURCE_PGPORT" \
    PGUSER="$RESTORE_SOURCE_PGUSER" \
    PGPASSWORD="$RESTORE_SOURCE_PGPASSWORD" \
    psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname "$RESTORE_SOURCE_PGDATABASE" "$@"
}

target_object_count=$(target_psql --quiet --tuples-only --no-align --command \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')")
target_object_count=$(printf '%s' "$target_object_count" | tr -d '[:space:]')
if [ "$target_object_count" -gt 0 ]; then
  [ "$allow_nonempty" = true ] \
    || fail 'Banco-alvo contém dados ou objetos; use --allow-nonempty para substituí-los explicitamente'
  schemas=$(target_psql --quiet --tuples-only --no-align --command \
    "SELECT quote_ident(nspname) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg_toast%' ORDER BY nspname")
  while IFS= read -r schema; do
    [ -n "$schema" ] && target_psql --quiet --command "DROP SCHEMA $schema CASCADE"
  done <<EOF
$schemas
EOF
  target_psql --quiet --command 'CREATE SCHEMA public'
fi

gzip -dc "$compressed_file" | target_psql --file=-

table_counts() {
  target_psql --quiet --tuples-only --no-align <<'SQL'
SELECT format('SELECT %L || chr(9) || count(*)::text FROM %I.%I;', table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
SQL
}

source_table_counts() {
  source_psql --quiet --tuples-only --no-align <<'SQL'
SELECT format('SELECT %L || chr(9) || count(*)::text FROM %I.%I;', table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
SQL
}

target_counts=$(table_counts)
if [ "$verify_source" = true ]; then
  source_counts=$(source_table_counts)
  if [ "$target_counts" != "$source_counts" ]; then
    printf '[restore] erro: contagens por tabela diferem da origem\n' >&2
    printf '%s\n' '--- origem' "$source_counts" '--- alvo' "$target_counts" >&2
    exit 1
  fi
  table_count=$(printf '%s\n' "$target_counts" | awk 'NF { count += 1 } END { print count + 0 }')
  printf '[restore] Contagens de tabelas conferem com a origem (%s tabelas)\n' "$table_count"
else
  printf '[restore] Contagens no banco restaurado:\n%s\n' "$target_counts"
fi

foreign_key_state=$(target_psql --quiet --tuples-only --no-align --command \
  "SELECT count(*) || ':' || count(*) FILTER (WHERE NOT convalidated) FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace")
foreign_key_state=$(printf '%s' "$foreign_key_state" | tr -d '[:space:]')
foreign_key_count=${foreign_key_state%%:*}
unvalidated_count=${foreign_key_state#*:}
[ "$foreign_key_count" -gt 0 ] || fail 'nenhuma chave estrangeira encontrada no banco restaurado'
[ "$unvalidated_count" -eq 0 ] || fail 'há chaves estrangeiras sem validação no banco restaurado'
printf '[restore] Integridade referencial verificada (%s chaves estrangeiras validadas)\n' "$foreign_key_count"

sample() {
  database_kind=$1
  sample_kind=$2
  query=''
  case "$sample_kind" in
    user)
      query="SELECT jsonb_build_object('id', id, 'email', email, 'fullName', \"fullName\")::text FROM users ORDER BY id LIMIT 1"
      ;;
    reservation)
      query="SELECT jsonb_build_object('id', id, 'status', status::text, 'clientId', \"clientId\", 'occurrenceId', \"occurrenceId\")::text FROM reservations ORDER BY id LIMIT 1"
      ;;
    presence)
      query="SELECT jsonb_build_object('reservationId', r.id, 'status', r.status::text, 'pointsEntryId', p.id, 'points', p.points)::text FROM reservations r JOIN points_entries p ON p.\"reservationId\" = r.id WHERE r.status = 'COMPLETED' AND p.type = 'ATTENDANCE' ORDER BY r.id LIMIT 1"
      ;;
    sheet)
      query="SELECT jsonb_build_object('id', id, 'title', title, 'clientId', \"clientId\", 'authorId', \"authorId\")::text FROM workout_sheets ORDER BY id LIMIT 1"
      ;;
    points)
      query="SELECT jsonb_build_object('id', id, 'type', type::text, 'points', points, 'clientId', \"clientId\", 'reservationId', \"reservationId\")::text FROM points_entries ORDER BY id LIMIT 1"
      ;;
  esac
  if [ "$database_kind" = source ]; then
    source_psql --quiet --tuples-only --no-align --command "$query"
  else
    target_psql --quiet --tuples-only --no-align --command "$query"
  fi
}

for sample_kind in user reservation presence sheet points; do
  target_sample=$(sample target "$sample_kind")
  if [ "$verify_source" = true ]; then
    source_sample=$(sample source "$sample_kind")
    [ "$target_sample" = "$source_sample" ] \
      || fail "amostra de $sample_kind diverge da origem"
  fi
done

if [ "$verify_source" = true ]; then
  printf '[restore] Amostras verificadas: usuário, reserva, presença, ficha e pontos\n'
else
  printf '[restore] Amostras consultadas no banco restaurado: usuário, reserva, presença, ficha e pontos\n'
fi
