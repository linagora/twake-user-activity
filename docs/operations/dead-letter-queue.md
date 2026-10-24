# Dead letter queue

A message lands in `user-activity.ingest.dlq` when it was not JSON, when the backend refused it for good, or when it stayed in the main queue for 72 hours or 20 deliveries ([Failures](../architecture/failures.md)). The body is the original message, untouched. Nothing expires it, so a growing dead letter queue is a sign to act on.

A deletion from `auth` or `b2b` there is an erasure the backend has not done yet, often because the Matomo token lacks `admin` access. Replay it before anything else.

## Replaying

1. Fix the cause.
2. Move the messages back to `user-activity.ingest`. RabbitMQ's shovel does this: the "Move messages" form of the management UI, which needs the `rabbitmq_shovel` and `rabbitmq_shovel_management` plugins.

The routing key does not matter: the bridge picks the source from the header RabbitMQ added when it dead lettered the message. Messages that are still invalid come back.

Matomo places a replayed hit at its original time, so reports for past days change after the next archiving.
