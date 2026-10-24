# twake-user-activity

The Activity Bridge of Twake Workplace. Apps publish an event on RabbitMQ when they see a user, and the bridge records it in an analytics backend, so one place answers when each user was last active and on which app.

- The backend is Matomo or PostHog, picked by one setting. Apps never talk to it, so switching backends changes nothing outside this repository.
- Users are pseudonymized before anything leaves the bridge: the backend stores an HMAC of the email, never the address.
- The bridge owns no database. It is a side service as defined in [ADR 068](https://github.com/linagora/twake-workplace-private/blob/99c6628bc22cdc704a941c93cc93011e70c995d9/documentation/docs/adrs/adr-068.md), and its design is [ADR 045](https://github.com/linagora/twake-workplace-private/pull/1390).

```mermaid
flowchart LR
  apps["Registration, cozy-stack,<br/>TOM, TMail"] -->|user activity events| mq[(RabbitMQ)]
  mq --> bridge[Activity Bridge]
  bridge -->|batched| backend["Matomo or PostHog"]
```

- [Reporting user activity from an app](docs/integration.md), for app developers.
- [Running the bridge](docs/operations.md): probes, metrics, alerts and the dead letter queue.

## Development

Node 24 is required.

```bash
npm install
docker compose up -d   # RabbitMQ, which the tests and the service need
npm run dev            # starts the service, reading .env when present
npm run check          # lint, format check, type check, tests and build
```

The probes answer on port 8080 (`/health/live`, `/health/ready`) and Prometheus metrics on port 9464 (`/metrics`). Readiness turns on once the queue is subscribed.

### Try it with a local Matomo

This runs the whole chain on your machine: demo events from mail, chat and drive go through RabbitMQ and the bridge, and show up in Matomo.

```bash
docker compose --profile matomo up -d --wait
scripts/matomo-setup.sh >> .env   # installs Matomo, one site per app, appends the settings
echo "AMQP_URL=amqp://guest:guest@localhost:5672" >> .env
grep -q '^PSEUDONYM_PEPPER=' .env || echo "PSEUDONYM_PEPPER=$(openssl rand -hex 32)" >> .env
echo "BILLING_EXCHANGE=billing" >> .env
npm run dev                       # leave it running: it declares the queue
npm run demo                      # in another terminal: a week of activity for 25 users, a third of them paying
docker compose exec matomo php console core:archive --url=http://localhost/
```

Then open http://localhost:8081 (login `admin`, password `admin-local-only-1`). Each app is a site. Visitors > User IDs lists the pseudonymous users, Behaviour > Events > Event Actions counts what they did, and Visitors > tenant and Visitors > platform split them by organization and by client. Matomo builds reports by archiving, which the last command does on demand.

Events published before the bridge first starts are lost, because nothing binds a queue to the exchange yet. The demo publishes with the `mandatory` flag, so it stops with an error in that case.

## Events

An app reports that it saw a user by publishing a [CloudEvent](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) on the `user-activity` topic exchange, with the event type as routing key.

- `type`: `com.twake.<app>.user.active.v1`, where `<app>` is lowercase, for example `com.twake.mail.user.active.v1`.
- `time`: when the user was seen.
- `twakeactor`: the user's email. Required.
- `twakeactorid`: the user's id. Optional.
- `twakeorg`: the tenant. Optional.
- `data.category`: `foreground` or `background`. Optional, `unclassified` when absent.
- `data.action`: a short name for what the user did. Optional.
- `data.platform`: `web`, `desktop` or `mobile`, the client the user was on. Optional.
- `data.ip`: the user's IPv4 or IPv6 address as the app saw it, for the backend's geolocation. Optional.

The bridge binds `com.twake.*.user.active.v1` to the quorum queue `user-activity.ingest`. Its dead letter queue is `user-activity.ingest.dlq`.

### Paying users

This is optional. An installation without cloudery, such as on premises, leaves `BILLING_EXCHANGE` unset and gets activity only.

With `BILLING_EXCHANGE` set (cloudery's `billing`), the bridge also binds `subscription.changed` to the same queue. Cloudery publishes it for a user whose plan changed, as plain JSON with `internalEmail` and `isPaying`. The bridge records it as an event of the `billing` app, at cloudery's publish time, under the same pseudonymous user id as the user's activity.

- PostHog gets a `subscription-paying` or `subscription-free` event that also sets the person property `paying`, so an insight can count paying users.
- Matomo has no per user properties. The events land on the `billing` site, which shows changes over time but not a current count.
- The organization level event `domain.subscription.changed` is not consumed.
- Apps cannot publish activity as `billing`: the name is reserved for these events.
- Unsetting `BILLING_EXCHANGE` later leaves the binding on the durable queue. Remove it by hand (`rabbitmqadmin delete binding source=billing destination=user-activity.ingest destination_type=queue properties_key=subscription.changed`), or the bridge drops each subscription change as a malformed activity.

Replicas consume in parallel, so two changes for one user a moment apart can reach the backend out of order. Matomo orders them by time. In PostHog the last one to arrive sets `paying`.

### Feature counts from the feed

The apps already publish what people do on the `activity` exchange, the feed Twake Space reads: `com.twake.tasks.task.assigned.v1`, `com.twake.calendar.event.accepted.v1` and so on. With `FEED_EXCHANGE` set to it, the bridge binds `com.twake.#` to the same queue and counts each event that names a person, so feature counts need no new publisher.

- The hit belongs to the app in the type, under the person in `twakeactor`, with the object and action as its action: `task.assigned`.
- An event without `time` or a `twakeactor` address is skipped: an organization token acted, or nobody did (a received mail). The feed belongs to the apps, so a message the bridge cannot read is skipped too, never dead lettered.
- The `user.active` heartbeat is skipped, since the activity source already counts it.
- A provisioned space is skipped, and so is an app the backend has no report for (an app missing from `MATOMO_SITES`), instead of being dead lettered.
- An action an assistant took for its owner carries the owner as actor, so it counts as the owner's.
- Unsetting `FEED_EXCHANGE` later leaves the binding on the durable queue. Remove it by hand (`rabbitmqadmin delete binding source=activity destination=user-activity.ingest destination_type=queue properties_key=com.twake.%23`), or the bridge drops every feed event as a malformed activity.

The event rules below apply to every kind of message.

- A message that is not JSON goes to the dead letter queue.
- A JSON message that is not a valid activity is logged and dropped.
- An event the backend refuses goes to the dead letter queue. When the backend refuses a whole batch, the bridge splits it until only the refused events are left.
- Any other failure retries in the process with a capped backoff, so a backend outage holds messages in the queue. A message still there after 72 hours goes to the dead letter queue.

## Configuration

All settings come from the environment and are checked at startup. An invalid environment stops the process and lists every invalid key.

- `AMQP_URL`: RabbitMQ URL. Required.
- `PSEUDONYM_PEPPER`: secret used for the HMAC of the email, at least 32 characters. Required. Changing it turns every user into a new one in the backend.
- `ANALYTICS_BACKEND`: `matomo` (default) or `posthog`. Only the selected backend's settings are required.
- `MATOMO_URL`, `MATOMO_TOKEN`: Matomo base URL and the token of a user with `write` access to every app site (see Security).
- `MATOMO_SITES`: JSON map of app to Matomo site id, for example `{"mail":3,"chat":2}`. Events from an app missing here are dead lettered.
- `MATOMO_DIMENSIONS`: JSON map of field to the id of the visit dimension that stores it, for example `{"tenant":1,"platform":2}`. The fields are `tenant` and `platform`, and a field missing here is not sent. Optional.
- `POSTHOG_HOST`, `POSTHOG_API_KEY`: PostHog ingestion host and project API key.
- `AMQP_EXCHANGE`, `AMQP_QUEUE`, `AMQP_DEAD_LETTER_EXCHANGE`: `user-activity`, `user-activity.ingest` and `<queue>.dlx` by default.
- `AMQP_PREFETCH`: deliveries each replica holds, `100` by default.
- `AMQP_MESSAGE_TTL_MS`, `AMQP_DELIVERY_LIMIT`: 72 hours and `20` by default.
- `BILLING_EXCHANGE`: the exchange cloudery publishes subscription changes on, usually `billing`. The bridge only checks that it exists and stops at startup when it does not. Unset, the bridge records activity only. With Matomo, `MATOMO_SITES` then needs a `billing` site.
- `FEED_EXCHANGE`: the apps' feed exchange, usually `activity`. Like `BILLING_EXCHANGE`, it must exist, and unset turns the feed off.
- `BATCH_SIZE`, `BATCH_WAIT_MS`: hits per backend request and how long a batch waits to fill, `100` and `1000` by default. `BATCH_SIZE` cannot exceed `AMQP_PREFETCH`.
- `ANALYTICS_TIMEOUT_MS`: backend request timeout, `10000` by default.
- `HTTP_HOST`: address to listen on, `0.0.0.0` by default.
- `HTTP_PORT`: probe port, `8080` by default.
- `METRICS_PORT`: metrics port, `9464` by default.
- `LOG_LEVEL`: pino level, `info` by default.
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`: error reporting, off when unset.

## Security

What reaches the backend for each event is the app, the time, the category, the action, the tenant, the platform, the pseudonymous user id, and the user's IP address when the app sent one. Without it, the backend only sees the bridge's own IP address and learns nothing about where users are. An IP address is personal data. Matomo applies its IP anonymization setting to it; check your PostHog project's IP settings before apps start sending it. The logs carry an event's routing key, message id and the error, not its body, except for a message that is not JSON: the RabbitMQ client logs its first 100 characters at error level, which also go to Sentry when it is on.

- Keep `PSEUDONYM_PEPPER` in a secret store. Anyone holding it can check whether a known address is a given user id.
- Give Matomo a dedicated user with `write` access to the app sites only, and use its token, not a superuser's. `write` is the lowest access that accepts the past timestamps and user IP addresses the bridge sends; with `view` access Matomo refuses every hit, and the bridge dead letters them.
- Give PostHog the public project API key, the one browsers use, never a personal API key. For an event without an IP address, the bridge turns off GeoIP, so PostHog does not place the user at the bridge's location.
- Only apps should be allowed to publish on the `user-activity` exchange. Anyone who can publish there can add activity for any user, so restrict it with RabbitMQ permissions on the vhost.
- The container runs as an unprivileged user, and only the probe and metrics ports listen. Neither takes input beyond the path.

## Delivery

- A pull request runs `npm audit` and `npm run check`, then builds the image and smoke tests it.
- A push to `main` publishes `ghcr.io/linagora/twake-user-activity:latest`.
- A tag `v<version>` publishes that version and a GitHub release. The tag must match the version in `package.json`.
