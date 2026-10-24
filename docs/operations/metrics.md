# Metrics and alerts

Prometheus text on `:9464/metrics`.

- `twake_user_activity_events_total{outcome}`: handled messages. `handled` went to the backend or was a feed event the bridge skips, `dropped` was not usable, `dead_lettered` was refused by the backend, `failed` will be retried. A retried message counts once per attempt.
- `twake_user_activity_backend_requests_seconds{backend,result}`: a summary of backend requests. `result` is `ok`, `unreachable` for a network error or timeout, the HTTP status when the backend answered with an error, or `error` when Matomo answered 200 without doing the work.

## Alerts

- `failed` growing for more than a few minutes: the backend is down or refuses the token. The logs say which: `the analytics backend refused our key` means the token.
- Any `dead_lettered`: the backend refused hits, for example from an app missing from `MATOMO_SITES`. See [Dead letter queue](dead-letter-queue.md).
- A steady rate of `dropped`: an app publishes events the bridge cannot use. The warning in the logs carries the routing key, which names the app.
- The depth of `user-activity.ingest` and `user-activity.ingest.dlq`, from RabbitMQ's own metrics.
