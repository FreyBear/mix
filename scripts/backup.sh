#!/usr/bin/env bash
# ==============================================================================
# Mixup – Automatisk sikkerhetskopi (SQLite + JSON + Google Drive / Rclone)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Les inn eventuelle overstyringer fra .env hvis den finnes
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source <(grep -E '^(BACKUP_|RCLONE_)' "${PROJECT_DIR}/.env" || true)
  set +a
fi

# Konfigurasjon
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_ROOT="${BACKUP_DIR:-${HOME}/mixup-backups}"
RCLONE_TARGET="${BACKUP_RCLONE_REMOTE:-gdrive:Mixup-Backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
CONTAINER_NAME="${BACKUP_CONTAINER:-mix-mixup-1}"
RCLONE_BIN="$(command -v rclone || echo "${HOME}/.local/bin/rclone")"

echo "================================================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starter sikkerhetskopi av Mixup"
echo "Prosjektmappe:  ${PROJECT_DIR}"
echo "Lagringsmappe:  ${BACKUP_ROOT}"
echo "Sky-mål:        ${RCLONE_TARGET}"
echo "================================================================="

mkdir -p "${BACKUP_ROOT}"

# 1. Sjekk at Docker-containeren kjører
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "FEIL: Docker-containeren '${CONTAINER_NAME}' kjører ikke!"
  echo "Prøver å finne aktiv Mixup-container via docker compose..."
  CONTAINER_NAME="$(cd "${PROJECT_DIR}" && docker compose ps -q mixup 2>/dev/null || true)"
  if [[ -z "${CONTAINER_NAME}" ]]; then
    echo "Kritisk feil: Ingen Mixup-container er aktiv. Avbryter."
    exit 1
  fi
fi

# 2. Opprett midlertidig mappe for sikkerhetskopien
STAGING_ID="mixup-backup-${TIMESTAMP}"
CONTAINER_STAGING="/app/data/.staging-${TIMESTAMP}"
HOST_STAGING="${BACKUP_ROOT}/${STAGING_ID}"
mkdir -p "${HOST_STAGING}"

cleanup() {
  docker exec "${CONTAINER_NAME}" rm -rf "${CONTAINER_STAGING}" 2>/dev/null || true
  rm -rf "${HOST_STAGING}" 2>/dev/null || true
}
trap cleanup EXIT

echo "--> [1/4] Gjør online SQLite-snapshot og genererer portabel JSON..."
docker exec -i "${CONTAINER_NAME}" node - /app/data/mixup.db "${CONTAINER_STAGING}" < "${SCRIPT_DIR}/export-backup.mjs"

# 3. Hent ut filene fra containeren til verten
echo "--> [2/4] Kopierer data ut av Docker-volumet..."
docker cp "${CONTAINER_NAME}:${CONTAINER_STAGING}/." "${HOST_STAGING}/"

# Ta også med .env-filen (uten sensitive passord om ønskelig, men verdifull for full restore)
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  cp "${PROJECT_DIR}/.env" "${HOST_STAGING}/mixup.env"
fi

# 4. Pakk og komprimer til .tar.gz
ARCHIVE_NAME="${STAGING_ID}.tar.gz"
ARCHIVE_PATH="${BACKUP_ROOT}/${ARCHIVE_NAME}"

echo "--> [3/4] Komprimerer arkiv: ${ARCHIVE_NAME}..."
tar -czf "${ARCHIVE_PATH}" -C "${BACKUP_ROOT}" "${STAGING_ID}"
ARCHIVE_SIZE="$(du -h "${ARCHIVE_PATH}" | cut -f1)"
echo "    ✔ Arkiv opprettet (${ARCHIVE_SIZE}): ${ARCHIVE_PATH}"

# 5. Last opp med rclone hvis konfigurert
if [[ -x "${RCLONE_BIN}" ]]; then
  # Sjekk om rclone-remoten (f.eks. 'gdrive:') er konfigurert
  REMOTE_NAME="${RCLONE_TARGET%%:*}"
  if "${RCLONE_BIN}" listremotes 2>/dev/null | grep -q "^${REMOTE_NAME}:"; then
    echo "--> [4/4] Laster opp til ${RCLONE_TARGET} via Rclone..."
    if "${RCLONE_BIN}" copy "${ARCHIVE_PATH}" "${RCLONE_TARGET}/"; then
      echo "    ✔ Vellykket opplasting til ${RCLONE_TARGET}"
      
      # Rydd opp eldre filer på Google Drive
      echo "--> Renser opp Google Drive (sletter filer eldre enn ${RETENTION_DAYS} dager)..."
      "${RCLONE_BIN}" delete --min-age "${RETENTION_DAYS}d" "${RCLONE_TARGET}/" 2>/dev/null || true
    else
      echo "    ⚠ Advarsel: Opplasting til ${RCLONE_TARGET} feilet. Den lokale kopien er beholdt."
    fi
  else
    echo "--> [4/4] Rclone-fjernkontroll '${REMOTE_NAME}:' er ikke konfigurert ennå."
    echo "    Lokal sikkerhetskopi er trygt lagret i: ${ARCHIVE_PATH}"
    echo "    Kjør 'rclone config' for å koble til Google Drive."
  fi
else
  echo "--> [4/4] Rclone er ikke funnet. Lokal sikkerhetskopi er trygt lagret i ${ARCHIVE_PATH}"
fi

# 6. Rydd opp lokale filer eldre enn RETENTION_DAYS
find "${BACKUP_ROOT}" -maxdepth 1 -type f -name "mixup-backup-*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "================================================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sikkerhetskopi fullført uten feil!"
echo "================================================================="
