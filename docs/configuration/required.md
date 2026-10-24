# Required settings

All settings come from the environment and are checked at startup. An invalid environment stops the process and names every invalid key.

- `AMQP_URL`: the RabbitMQ URL, `amqp://` or `amqps://`.
- `PSEUDONYM_PEPPER`: the secret of the pseudonym HMAC, at least 32 characters. Changing it turns every user into a new one in the backend.
- `ANALYTICS_BACKEND`: `matomo` (default) or `posthog`. Only the chosen backend's settings are required.

## Matomo

- `MATOMO_URL`: the Matomo base URL.
- `MATOMO_TOKEN`: the token of a dedicated user with `write` access to the app sites, or `admin` when erasure is on.
- `MATOMO_SITES`: a JSON map of app to site id. It needs a `billing` site when paying users are on.
- `MATOMO_DIMENSIONS`: a JSON map of field (`tenant`, `platform`) to dimension id. Optional; a field missing here is not sent.

[Matomo](../backends/matomo.md) explains how to create them.

## PostHog

- `POSTHOG_HOST`: the ingestion host.
- `POSTHOG_API_KEY`: the project API key.
- `POSTHOG_PROJECT_URL`, `POSTHOG_PERSONAL_API_KEY`: only when erasure is on, and then both.

[PostHog](../backends/posthog.md) explains where to find them.
