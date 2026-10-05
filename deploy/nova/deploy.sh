#!/usr/bin/env bash
set -euo pipefail

HOST="${NOVA_CRM_HOST:?Set NOVA_CRM_HOST to the SSH destination}"
REMOTE_DIR="/opt/nova-crm-hub"
COMPOSE="docker compose -f docker-compose.hetzner.yml"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The remote directory also holds .env, connector state and backups, so only
# the files this script owns are copied and nothing there is ever deleted.
DEPLOY_FILES=(docker-compose.hetzner.yml .env.example)

echo "Syncing deployment files to ${HOST}:${REMOTE_DIR}"
ssh "${HOST}" "mkdir -p ${REMOTE_DIR} && docker network inspect novahub >/dev/null 2>&1 || docker network create novahub >/dev/null"
rsync -az \
  "${DEPLOY_FILES[@]/#/${SCRIPT_DIR}/}" "${HOST}:${REMOTE_DIR}/"

echo "Pulling and starting Nova CRM"
ssh "${HOST}" "cd ${REMOTE_DIR} && ${COMPOSE} pull && ${COMPOSE} up -d"

echo "Waiting for the server health check"
server_state="starting"
for _ in $(seq 1 60); do
  server_state=$(
    ssh "${HOST}" \
      "cd ${REMOTE_DIR} && docker inspect --format '{{.State.Health.Status}}' \$(${COMPOSE} ps -q server)" \
      2>/dev/null || echo "starting"
  )

  if [[ "${server_state}" == "healthy" ]]; then
    break
  fi

  sleep 5
done

if [[ "${server_state}" != "healthy" ]]; then
  echo "Server did not become healthy: ${server_state}" >&2
  exit 1
fi

echo "Checking https://crm.nova-tool.online/healthz"
curl --fail --silent --show-error https://crm.nova-tool.online/healthz >/dev/null
echo "Nova CRM is healthy"
