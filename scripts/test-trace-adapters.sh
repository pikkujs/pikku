#!/bin/bash
# Runs the trace suites that need a real broker, against disposable containers
# on ports nothing else uses, and removes the containers however it ends.
#   bash scripts/test-trace-adapters.sh
set -u

REDIS_PORT=46379 PG_PORT=45432 NATS_PORT=44222
SUFFIX="$$"
CONTAINERS=("pikku-trace-redis-$SUFFIX" "pikku-trace-pg-$SUFFIX" "pikku-trace-nats-$SUFFIX")

cleanup() { docker rm -f "${CONTAINERS[@]}" >/dev/null 2>&1; }
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not available: start it, these suites do not fall back to mocks." >&2
  exit 2
fi

docker run -d --rm --name "${CONTAINERS[0]}" -p "$REDIS_PORT:6379" redis:7-alpine >/dev/null || exit 1
docker run -d --rm --name "${CONTAINERS[1]}" -p "$PG_PORT:5432" -e POSTGRES_PASSWORD=trace postgres:17-alpine >/dev/null || exit 1
docker run -d --rm --name "${CONTAINERS[2]}" -p "$NATS_PORT:4222" nats:2.14.7-alpine -js >/dev/null || exit 1

for _ in $(seq 1 60); do
  docker exec "${CONTAINERS[1]}" pg_isready -U postgres >/dev/null 2>&1 && break
  perl -e 'select(undef,undef,undef,0.5)'
done
for _ in $(seq 1 60); do
  [ "$(docker exec "${CONTAINERS[0]}" redis-cli ping 2>/dev/null)" = "PONG" ] && break
  perl -e 'select(undef,undef,undef,0.5)'
done

export REDIS_TEST_URL="redis://localhost:$REDIS_PORT"
export PG_BOSS_TEST_URL="postgres://postgres:trace@localhost:$PG_PORT/postgres"
export NATS_TEST_URL="nats://localhost:$NATS_PORT"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
status=0
run() {
  echo "--- $1"
  (cd "$ROOT/$1" && shift && "$@") || status=1
}

run packages/services/queue-bullmq bun test src/bull-queue-trace.test.ts --timeout 180000
run packages/services/queue-pg-boss bun test src/pg-boss-queue-trace.test.ts --timeout 180000
run packages/services/queue-nats bun test src/nats-queue-trace.test.ts src/nats-integration.test.ts --timeout 180000
export DATABASE_URL="$PG_BOSS_TEST_URL"
run packages/services/kysely-postgres bun test src/pg-kysely-server.test.ts src/pikku-kysely-trace.test.ts --timeout 180000
run verifiers/tracing bun run test:distributed

exit $status
