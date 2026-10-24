# Publishing

With [`@linagora/rabbitmq-client`](https://www.npmjs.com/package/@linagora/rabbitmq-client):

```ts
import { randomUUID } from 'node:crypto'
import { RabbitMQClient } from '@linagora/rabbitmq-client'

const client = new RabbitMQClient({ url: process.env.AMQP_URL })
await client.init()

export async function reportActivity(
  email: string,
  org: string,
  action: string
) {
  const type = 'com.twake.drive.user.active.v1'
  await client.publish('user-activity', type, {
    specversion: '1.0',
    id: randomUUID(),
    source: 'twake://drive',
    type,
    time: new Date().toISOString(),
    twakeactor: email,
    twakeorg: org,
    data: { category: 'foreground', action, platform: 'web' }
  })
}
```

Any AMQP client works the same way:

- Publish the JSON body with `content-type: application/json` and persistent delivery, on `user-activity`, with `type` as routing key.
- Use the CloudEvent `id` as the AMQP message id, so the logs on both sides match.
- If the app declares the exchange, declare it as a durable topic exchange, like the bridge does. RabbitMQ refuses a second declaration with different settings.

Losing one activity event is harmless, so publishing must never block or fail the user's action. Publish after the action succeeded, and log a failed publish instead of surfacing it.

## Trying it

[Local setup](../development/local-setup.md) runs RabbitMQ, Matomo and the bridge on your machine. Publish against `amqp://guest:guest@localhost:5672`, and the event shows up in Matomo after `core:archive`.

The bridge must have started once before you publish, because it declares the queue. Before that, the exchange routes events nowhere and RabbitMQ drops them.
