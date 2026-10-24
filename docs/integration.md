# Reporting user activity from an app

An app tells the bridge that it saw a user by publishing one event on RabbitMQ. The app never calls Matomo or PostHog, and it does not wait for the bridge.

```mermaid
sequenceDiagram
  participant App
  participant MQ as RabbitMQ (user-activity exchange)
  participant Bridge as Activity Bridge
  participant Backend as Matomo or PostHog
  App->>MQ: com.twake.mail.user.active.v1
  MQ->>Bridge: user-activity.ingest queue
  Bridge->>Bridge: validate, replace the email with an HMAC
  Bridge->>Backend: one request per batch
  Bridge-->>MQ: ack once the backend accepted the batch
```

## When to publish

Publish when the user does something worth counting: opening the app, sending a message, sharing a file. One event per meaningful action is enough. Do not publish on timers or background syncs that the user did not trigger, unless you mark them `background` so reports can leave them out.

## The event

A [CloudEvent 1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) in structured JSON mode, published on the `user-activity` topic exchange with the event `type` as routing key.

```json
{
  "specversion": "1.0",
  "id": "0192f0c2-7c1e-7000-8000-4b1f2a3c5d6e",
  "source": "twake://mail",
  "type": "com.twake.mail.user.active.v1",
  "time": "2026-10-24T10:30:00Z",
  "twakeactor": "alice@acme.example.com",
  "twakeactorid": "6f1c1b5e-0000-4000-8000-000000000001",
  "twakeorg": "acme.example.com",
  "data": {
    "category": "foreground",
    "action": "share-by-link",
    "platform": "mobile"
  }
}
```

- `type` names the app: `com.twake.<app>.user.active.v1`, where `<app>` is lowercase letters, digits and dashes. Each app is one Matomo site, or one `app` property in PostHog.
- `time` is when the user acted, with a timezone. The bridge records this time, not the time it received the event.
- `twakeactor` is the user's email. It never leaves the bridge.
- `twakeorg` is the tenant, usually the organization's domain. Reports can split on it. Leave it out for a user with no organization.
- `data.category` is `foreground` when the user is looking at the app, `background` otherwise.
- `data.action` is what the user did, for example `share-by-link` or `share-by-email`. Keep the list short and stable per app: each value becomes a row in the reports.
- `data.platform` is `web`, `desktop` or `mobile`.

Only `type`, `time` and `twakeactor` are required, plus the CloudEvents attributes `specversion`, `id` and `source`. The README lists what happens to an event the bridge cannot use.

## Publishing from Node

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

Any AMQP client works the same way: publish the JSON body with `content-type: application/json`, persistent delivery, on the `user-activity` exchange, with `type` as routing key. If the app declares the exchange, declare it as a durable topic exchange, like the bridge does. RabbitMQ refuses a second declaration with different settings.

Losing one activity event is harmless, so publishing must never block or fail the user's action. Publish after the action succeeded, and log a failed publish instead of surfacing it.

## Trying it

The README's "Try it with a local Matomo" section runs RabbitMQ, Matomo and the bridge on your machine. With it running, publish from your app against `amqp://guest:guest@localhost:5672` and the event shows up in Matomo after `core:archive`.

The bridge must have started once before you publish, because it declares the queue. Before that, the exchange routes events nowhere and RabbitMQ drops them.
