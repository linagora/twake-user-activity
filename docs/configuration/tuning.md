# Tuning

The defaults suit a production deployment.

## RabbitMQ

- `AMQP_EXCHANGE`: the bridge's own exchange, `user-activity` by default.
- `AMQP_QUEUE`: `user-activity.ingest` by default.
- `AMQP_DEAD_LETTER_EXCHANGE`: `<queue>.dlx` by default. The dead letter queue is `<queue>.dlq`.
- `AMQP_PREFETCH`: deliveries each replica holds, `100` by default.
- `AMQP_MESSAGE_TTL_MS`: how long a message may wait in the queue, 72 hours by default.
- `AMQP_DELIVERY_LIMIT`: deliveries before a message is dead lettered, `20` by default.

## Batching

- `BATCH_SIZE`: hits per backend request, `100` by default. It cannot exceed `AMQP_PREFETCH`, because a batch only fills from the deliveries a replica holds.
- `BATCH_WAIT_MS`: how long a batch waits to fill, `1000` by default.
- `ANALYTICS_TIMEOUT_MS`: the backend request timeout, `10000` by default.

## Server

- `HTTP_HOST`: the address to listen on, `0.0.0.0` by default.
- `HTTP_PORT`: the probe port, `8080` by default.
- `METRICS_PORT`: the metrics port, `9464` by default.
- `LOG_LEVEL`: the pino level, `info` by default.
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`: error reporting, off when `SENTRY_DSN` is unset.
