# Probes

- `GET :8080/health/ready` answers 200 once the bridge consumes the queue, and 503 while it starts or shuts down.
- `GET :8080/health/live` answers 503 when the broker connection has been down for more than a minute, when the subscription was lost after a reconnect, or when one delivery has been in progress for more than five minutes. A restart fixes each of these.

A backend outage fails neither probe. The bridge keeps the messages in the queue and retries, so a restart would not help.
