import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { RabbitMQClient } from '@linagora/rabbitmq-client'
import { pino } from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'
import { consumerStats, startConsumer } from './infra/amqp.ts'
import { createBatcher } from './modules/activity/batch.ts'
import { ROUTING_KEY } from './modules/activity/schema.ts'
import { ROUTING_KEY as BILLING_ROUTING_KEY } from './modules/billing/handlers.ts'
import { routeMessages } from './modules/router.ts'
import { fakeTracker } from './product/fake.ts'

// Against a real broker: docker compose up rabbitmq, or the one CI starts.
const AMQP_URL =
  process.env.TEST_AMQP_URL ?? 'amqp://guest:guest@localhost:5672'
const logger = pino({ level: 'silent' })

const event = (app: string, overrides: Record<string, unknown> = {}) => ({
  specversion: '1.0',
  id: randomUUID(),
  source: `twake://${app}`,
  type: `com.twake.${app}.user.active.v1`,
  time: new Date().toISOString(),
  twakeactor: 'alice@example.com',
  ...overrides
})

async function until(condition: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out')
    await delay(50)
  }
}

const clients: RabbitMQClient[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
})

async function start() {
  const name = `test-${randomUUID()}`
  const config = loadConfig({
    AMQP_URL,
    AMQP_EXCHANGE: name,
    AMQP_QUEUE: `${name}.ingest`,
    BILLING_EXCHANGE: `${name}.billing`,
    BATCH_WAIT_MS: '20',
    MATOMO_URL: 'http://matomo.invalid',
    MATOMO_TOKEN: 'unused',
    MATOMO_SITES: '{"mail":1,"billing":2}',
    PSEUDONYM_PEPPER: 'a-pepper-that-is-at-least-32-characters'
  })
  const tracker = fakeTracker()
  const stats = consumerStats()
  const batcher = createBatcher({ tracker, size: 10, waitMs: 20 })
  const publisher = new RabbitMQClient({ url: AMQP_URL, logger })
  await publisher.init()
  clients.push(publisher)
  const publish = (body: Record<string, unknown>) =>
    publisher.publish(name, String(body.type), body)
  const publishBilling = (body: Record<string, unknown>) =>
    publisher.publish(`${name}.billing`, BILLING_ROUTING_KEY, body)
  // The bridge only checks for the billing exchange, so stand in for cloudery,
  // whose first publish declares it. Nothing is bound yet: this one is dropped.
  await publishBilling({})
  const consumer = await startConsumer(
    config,
    logger,
    stats,
    ROUTING_KEY,
    routeMessages({
      pepper: config.PSEUDONYM_PEPPER,
      billingExchange: config.BILLING_EXCHANGE,
      track: hit => batcher.submit(hit)
    })
  )
  clients.push(consumer)
  return { tracker, stats, publish, publishBilling }
}

describe('consumer', () => {
  it('tracks the activity events published for any app', async () => {
    const { tracker, publish } = await start()
    await publish(event('mail'))
    await publish(event('chat', { data: { action: 'message.sent' } }))
    await until(() => tracker.hits.length === 2)
    expect(tracker.hits.map(hit => [hit.app, hit.action])).toEqual([
      ['mail', 'activity'],
      ['chat', 'message.sent']
    ])
  })

  it('records subscription changes from the billing exchange', async () => {
    const { tracker, publishBilling } = await start()
    await publishBilling({
      twakeId: 'alice',
      internalEmail: 'alice@example.com',
      isPaying: true
    })
    await until(() => tracker.hits.length === 1)
    expect(tracker.hits[0]).toMatchObject({ app: 'billing', paying: true })
  })

  it('drops a malformed event and keeps consuming', async () => {
    const { tracker, stats, publish } = await start()
    await publish(event('mail', { twakeactor: undefined }))
    await publish(event('mail'))
    await until(() => tracker.hits.length === 1)
    expect(stats.outcomes.get('dropped')).toBe(1)
  })

  it('dead letters what the backend refuses and keeps consuming', async () => {
    const { tracker, stats, publish } = await start()
    tracker.next = () => Promise.resolve({ refused: new Set([0]) })
    await publish(event('mail'))
    await until(() => stats.outcomes.get('dead_lettered') === 1)
    await publish(event('mail'))
    await until(() => tracker.hits.length === 1)
  })
})
