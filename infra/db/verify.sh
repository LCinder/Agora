#!/usr/bin/env bash
# Applies the schema and the policies to a throwaway PostgreSQL and runs the
# tenant isolation tests against it.
#
# Needs Docker running. Leaves nothing behind.
#
#   ./infra/db/verify.sh

set -euo pipefail

CONTAINER=agora-db-verify
IMAGE=postgres:17-alpine
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker run --rm -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify "$IMAGE" >/dev/null

printf 'Waiting for PostgreSQL'
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    printf ' ready\n'
    break
  fi
  printf '.'
done

for file in schema.sql policies.sql tests.sql; do
  docker cp "$HERE/$file" "$CONTAINER:/tmp/$file" >/dev/null
done

# MSYS_NO_PATHCONV keeps Git Bash on Windows from rewriting the container paths.
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" \
  psql -U postgres -v ON_ERROR_STOP=1 -q \
  -f //tmp/schema.sql -f //tmp/policies.sql -f //tmp/tests.sql 2>&1 |
  grep -E 'NOTICE:  ok|FAIL|All isolation' |
  sed 's/psql:.*NOTICE:  //'
