# Access

## Secrets

- Keep `PSEUDONYM_PEPPER` and the backend keys in a secret store.

## Matomo

- Give the bridge a dedicated user and its token, never a super user's.
- `write` access to the app sites is the lowest that works: it accepts the past timestamps and user IP addresses the bridge sends. With `view` access Matomo refuses every hit, and the bridge dead letters them.
- [Erasure](../sources/erasure.md) needs `admin` on the same sites, which also lets the token change their settings. Grant it only where erasure is on.

## PostHog

- Track with the project API key, the public one browsers use.
- The personal API key for erasure needs only the `person:write` scope, on this one project.

## RabbitMQ

- Only apps should publish on `user-activity`: anyone who can publish there can add activity for any user. Restrict it with RabbitMQ permissions on the vhost.
- The same goes for `auth` and `b2b` when erasure is on: a forged deletion erases a real user's analytics.

## Container

The container runs as an unprivileged user, and only the probe and metrics ports listen. Neither takes input beyond the path.
