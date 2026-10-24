// Publishes a week of user activity from mail, chat and drive, the way the
// apps do, so a local backend has something to show.
import { randomUUID } from 'node:crypto'
import { RabbitMQClient } from '@linagora/rabbitmq-client'

const AMQP_URL = process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672'
const EXCHANGE = process.env.AMQP_EXCHANGE ?? 'user-activity'
const USERS = Number(process.env.DEMO_USERS ?? 25)
const DAYS = Number(process.env.DEMO_DAYS ?? 7)

const APPS = {
  mail: ['open-inbox', 'send-message', 'search'],
  chat: ['open-room', 'send-message', 'start-call'],
  drive: ['upload', 'share-by-link', 'share-by-email']
} as const
const TENANTS = ['acme.example.com', 'globex.example.com']
const DAY_MS = 86_400_000

const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)] as T

const client = new RabbitMQClient({ url: AMQP_URL })
await client.init()

let published = 0
for (let user = 0; user < USERS; user++) {
  const tenant = pick(TENANTS)
  const email = `user${String(user)}@${tenant}`
  for (let day = DAYS - 1; day >= 0; day--) {
    // Some users skip days, so last-seen dates differ.
    if (Math.random() < 0.3) continue
    for (const [app, actions] of Object.entries(APPS)) {
      if (Math.random() < 0.4) continue
      const time = new Date(
        Date.now() - day * DAY_MS - Math.random() * 8 * 3_600_000
      )
      const type = `com.twake.${app}.user.active.v1`
      // Mandatory, so a missing queue fails here instead of losing the event.
      await client.publish(
        EXCHANGE,
        type,
        {
          specversion: '1.0',
          id: randomUUID(),
          source: `twake://${app}`,
          type,
          time: time.toISOString(),
          twakeactor: email,
          twakeorg: tenant,
          data: {
            category: Math.random() < 0.8 ? 'foreground' : 'background',
            action: pick(actions)
          }
        },
        { mandatory: true }
      )
      published++
    }
  }
}
await client.close()
console.log(`published ${String(published)} events for ${String(USERS)} users`)
