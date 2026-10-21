#!/usr/bin/env bash
# Isolated, throwaway Postgres for destructive migration tests.
#
#   scripts/test-db.sh up     # start (same Supabase Postgres image as the local stack) on 127.0.0.1:54399
#   scripts/test-db.sh down   # remove it and everything in it
#
# It never shares data with the development database (supabase start, :54322).
set -euo pipefail
NAME=rhythm_test_db
PORT="${RHYTHM_ISOLATED_DB_PORT:-54399}"
IMAGE="$(docker inspect -f '{{.Config.Image}}' supabase_db_rhythm 2>/dev/null || echo public.ecr.aws/supabase/postgres:17.6.1.156)"
case "${1:-up}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null
    for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 2; done
    echo "isolated test database ready on 127.0.0.1:$PORT ($IMAGE)";;
  down)
    docker rm -f "$NAME" >/dev/null && echo "isolated test database removed";;
  *) echo "usage: $0 up|down" >&2; exit 2;;
esac
