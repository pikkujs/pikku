#!/bin/bash
# Runs the distributed trace suite, which cannot mean anything without a real
# Redis. Uses REDIS_TEST_URL if set, otherwise a disposable container, and fails
# rather than reporting a pass with nothing run.
set -u

if [ -z "${REDIS_TEST_URL:-}" ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "test:distributed needs a real Redis: set REDIS_TEST_URL or start Docker." >&2
    exit 2
  fi
  CONTAINER="pikku-distributed-redis-$$"
  trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1' EXIT
  docker run -d --rm --name "$CONTAINER" -p 127.0.0.1::6379 redis:7-alpine >/dev/null || exit 1
  for _ in $(seq 1 60); do
    [ "$(docker exec "$CONTAINER" redis-cli ping 2>/dev/null)" = "PONG" ] && break
    perl -e 'select(undef,undef,undef,0.5)'
  done
  REDIS_TEST_URL="redis://$(docker port "$CONTAINER" 6379/tcp | head -1)"
  export REDIS_TEST_URL
fi

node --import tsx --test src/distributed/distributed.assert.ts
