#!/bin/sh
set -eu
set -o pipefail

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
filename="backup-${timestamp}-$$.sql.gz.age"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT HUP INT TERM
encrypted_file="$workdir/$filename"

pg_dump --no-owner --no-privileges \
  | gzip -n -c \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$encrypted_file"

destination_path() {
  destination=$1
  kind=$2
  case "$destination" in
    file:///*)
      path=${destination#file://}
      printf 'file://%s/%s' "${path%/}" "$kind"
      ;;
    s3://*)
      s3_location=${destination#s3://}
      bucket=${s3_location%%/*}
      prefix=${s3_location#"$bucket"}
      prefix=${prefix#/}
      if [ -n "$prefix" ]; then
        path="fitburn:$bucket/$prefix"
      else
        path="fitburn:$bucket"
      fi
      printf '%s/%s' "$path" "$kind"
      ;;
  esac
}

publish_file() {
  file=$1
  target=$2
  case "$target" in
    file:///*)
      path=${target#file://}
      mkdir -p "$path"
      cp "$file" "$path/.$filename.upload"
      mv "$path/.$filename.upload" "$path/$filename"
      ;;
    fitburn:*)
      rclone copyto "$file" "$target/$filename" --no-traverse --quiet
      ;;
  esac
}

prune_files() {
  target=$1
  keep=$2
  case "$target" in
    file:///*)
      path=${target#file://}
      if [ -d "$path" ]; then
        find "$path" -mindepth 1 -maxdepth 1 -type f -name 'backup-*.sql.gz.age' -print \
          | sort -r \
          | {
            count=0
            while IFS= read -r file; do
              count=$((count + 1))
              if [ "$count" -gt "$keep" ]; then rm -f "$file"; fi
            done
          }
      fi
      ;;
    fitburn:*)
      rclone lsf "$target" --files-only --quiet \
        | awk '/^backup-.*\.sql\.gz\.age$/ { print $0 }' \
        | sort -r \
        | {
          count=0
          while IFS= read -r file; do
            count=$((count + 1))
            if [ "$count" -gt "$keep" ]; then
              rclone deletefile "$target/$file" --quiet
            fi
          done
        }
      ;;
  esac
}

daily_target=$(destination_path "$BACKUP_DESTINATION" daily)
publish_file "$encrypted_file" "$daily_target"
if [ "$(date -u +%u)" = 7 ]; then
  weekly_target=$(destination_path "$BACKUP_DESTINATION" weekly)
  publish_file "$encrypted_file" "$weekly_target"
fi

prune_files "$daily_target" 14
prune_files "$(destination_path "$BACKUP_DESTINATION" weekly)" 8

curl --fail --silent --show-error --max-time 10 --output /dev/null "$BACKUP_HEARTBEAT_URL"
printf '[backup] execução diária concluída\n'
