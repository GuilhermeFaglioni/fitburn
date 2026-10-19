FROM postgres:16-alpine

ARG TARGETARCH

RUN apk add --no-cache ca-certificates curl unzip \
  && case "$TARGETARCH" in \
    amd64) age_arch=amd64; rclone_arch=amd64; supercronic_arch=amd64 ;; \
    arm64) age_arch=arm64; rclone_arch=arm64; supercronic_arch=arm64 ;; \
    *) echo "Arquitetura não suportada: $TARGETARCH" >&2; exit 1 ;; \
  esac \
  && curl -fsSL "https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-${age_arch}.tar.gz" -o /tmp/age.tar.gz \
  && tar -xzf /tmp/age.tar.gz -C /tmp \
  && install -m 0755 /tmp/age/age /tmp/age/age-keygen /usr/local/bin/ \
  && curl -fsSL "https://downloads.rclone.org/v1.69.1/rclone-v1.69.1-linux-${rclone_arch}.zip" -o /tmp/rclone.zip \
  && unzip -q /tmp/rclone.zip -d /tmp \
  && install -m 0755 "/tmp/rclone-v1.69.1-linux-${rclone_arch}/rclone" /usr/local/bin/rclone \
  && curl -fsSL "https://github.com/aptible/supercronic/releases/download/v0.2.43/supercronic-linux-${supercronic_arch}" -o /usr/local/bin/supercronic \
  && chmod 0755 /usr/local/bin/supercronic \
  && rm -rf /tmp/age /tmp/age.tar.gz /tmp/rclone-v1.69.1-linux-${rclone_arch} /tmp/rclone.zip /var/cache/apk/*

WORKDIR /app
COPY --chown=postgres:postgres docker/backup/backup.sh /app/backup.sh
COPY --chown=postgres:postgres docker/backup/restore.sh /app/restore.sh
COPY --chown=postgres:postgres docker/backup/entrypoint.sh /usr/local/bin/backup-entrypoint
COPY --chown=postgres:postgres docker/backup/crontab /etc/crontabs/postgres
RUN chmod 0755 /app/backup.sh /app/restore.sh /usr/local/bin/backup-entrypoint \
  && mkdir -p /backups \
  && chown postgres:postgres /backups

ENV TZ=UTC \
    HOME=/var/lib/postgresql
USER postgres
ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
CMD ["supercronic", "/etc/crontabs/postgres"]
