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

## Development

Node 24 is required.

```bash
npm install
npm run dev     # starts the service, reading .env when present
npm run check   # lint, format check, type check, tests and build
```

The probes answer on port 8080 (`/health/live`, `/health/ready`) and Prometheus metrics on port 9464 (`/metrics`).

## Configuration

All settings come from the environment and are checked at startup. An invalid environment stops the process and lists every invalid key.

- `HTTP_HOST`: address to listen on, `0.0.0.0` by default.
- `HTTP_PORT`: probe port, `8080` by default.
- `METRICS_PORT`: metrics port, `9464` by default.
- `LOG_LEVEL`: pino level, `info` by default.
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`: error reporting, off when unset.

## Delivery

- A pull request runs `npm audit` and `npm run check`, then builds the image and smoke tests it.
- A push to `main` publishes `ghcr.io/linagora/twake-user-activity:latest`.
- A tag `v<version>` publishes that version and a GitHub release. The tag must match the version in `package.json`.
