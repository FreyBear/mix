#!/usr/bin/env bash
# ==============================================================================
# Mixup – Gjenoppretting fra sikkerhetskopi (.tar.gz eller .sqlite)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Bruk: $0 <sti-til-backup-fil.tar.gz>"
  echo "Eksempel: $0 ~/mixup-backups/mixup-backup-2026-10-19_220730.tar.gz"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "FEIL: Fant ikke filen '${BACKUP_FILE}'"
  exit 1
fi

CONTAINER_NAME="mix-mixup-1"
TMP_DIR="$(mktemp -d /tmp/mixup-restore-XXXXXX)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "================================================================="
echo "Gjenoppretter Mixup fra: ${BACKUP_FILE}"
echo "================================================================="

# Pakk ut arkivet
echo "--> Pakker ut arkiv..."
tar -xzf "${BACKUP_FILE}" -C "${TMP_DIR}"

SQLITE_FILE="$(find "${TMP_DIR}" -type f -name "mixup.sqlite" | head -n 1)"
if [[ -z "${SQLITE_FILE}" ]]; then
  echo "FEIL: Fant ingen 'mixup.sqlite' i arkivet!"
  exit 1
fi

echo "--> Fant SQLite-database: ${SQLITE_FILE}"

# Bekreftelse
echo "ADVARSEL: Dette vil overskrive gjeldende database i den aktive containeren."
read -p "Er du sikker på at du vil fortsette? (j/N): " -r CONFIRM
if [[ ! "${CONFIRM}" =~ ^[jJyY]$ ]]; then
  echo "Avbrutt av bruker."
  exit 0
fi

# Sikkerhetskopi av nåværende tilstand før overskriving
echo "--> Tar en sikkerhetskopi av nåværende tilstand først..."
"${SCRIPT_DIR}/backup.sh" || true

echo "--> Stopper skriveoperasjoner og overfører gjenopprettet database..."
docker cp "${SQLITE_FILE}" "${CONTAINER_NAME}:/app/data/mixup.db"

# Rydd bort gamle WAL-filer i containeren så SQLite åpner rent
docker exec "${CONTAINER_NAME}" rm -f /app/data/mixup.db-wal /app/data/mixup.db-shm 2>/dev/null || true

echo "--> Restarter Mixup-container..."
cd "${PROJECT_DIR}"
docker compose restart mixup

echo "================================================================="
echo "✔ Gjenoppretting fullført med suksess!"
echo "Appen kjører nå med gjenopprettet data."
echo "================================================================="
