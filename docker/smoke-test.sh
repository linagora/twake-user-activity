#!/usr/bin/env bash
# Boots the image as in production (uid 1000, read-only root filesystem, no capability)
# next to a RabbitMQ, then checks it declares its queue, serves its probes and metrics
# and stops cleanly.
#
#   docker/smoke-test.sh twake-user-activity:dev
set -euo pipefail

IMAGE="${1:?usage: $0 <image>}"
RUN="twake-user-activity-smoke-$$"
cleanup() {
  docker rm -f "$RUN" "$RUN-rabbitmq" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The service joins the broker's network namespace, so its ports are published
# here and no network has to be created.
# The image sets no USER, so without --user the broker runs as root.
docker run -d --name "$RUN-rabbitmq" --user 999:999 \
  -p 127.0.0.1::8080 -p 127.0.0.1::9464 \
  rabbitmq:4.1-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$RUN-rabbitmq" rabbitmq-diagnostics -q check_port_connectivity \
    >/dev/null 2>&1 && break
  sleep 1
done

docker run -d --name "$RUN" --network "container:$RUN-rabbitmq" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -e AMQP_URL="amqp://guest:guest@localhost:5672" \
  -e PSEUDONYM_PEPPER=smoke-test-pepper-of-at-least-32-chars \
  -e ANALYTICS_BACKEND=posthog \
  -e POSTHOG_HOST=http://posthog.invalid \
  -e POSTHOG_API_KEY=smoke \
  "$IMAGE" >/dev/null
API="http://$(docker port "$RUN-rabbitmq" 8080/tcp | head -1)"
METRICS="http://$(docker port "$RUN-rabbitmq" 9464/tcp | head -1)"

failures=0
expect() {
  # shellcheck disable=SC2053 # $3 is a glob pattern
  if [[ "$2" == $3 ]]; then
    echo "ok   $1"
  else
    echo "FAIL $1: got '$2'"
    failures=$((failures + 1))
  fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@" || true; }

for _ in $(seq 1 60); do
  [[ "$(status "$API/health/ready")" == 200 ]] && break
  sleep 1
done

expect 'ready once started' "$(status "$API/health/ready")" '200'
expect 'alive' "$(status "$API/health/live")" '200'
expect 'runs as uid 1000' "$(docker exec "$RUN" stat -c %u /proc/1)" '1000'
expect 'metrics served' "$(status "$METRICS/metrics")" '200'
expect 'events counter exported' \
  "$(curl -s "$METRICS/metrics" || true)" '*twake_user_activity_events_total*'
expect 'quorum queue bound with a delivery limit' \
  "$(docker exec "$RUN-rabbitmq" rabbitmqctl -q list_queues name type arguments)" \
  '*user-activity.ingest*quorum*x-delivery-limit*'

docker kill -s TERM "$RUN" >/dev/null
code="$(timeout 40 docker wait "$RUN" || echo timeout)"
expect 'stops on SIGTERM with code 0' "$code" '0'

if ((failures > 0)); then
  echo "$failures check(s) failed; logs:"
  docker logs "$RUN" 2>&1 | tail -40
  exit 1
fi
echo "all checks passed"
