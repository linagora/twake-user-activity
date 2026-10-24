import { DeadLetterError } from '@linagora/rabbitmq-client'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { MalformedEventError, RejectedEventError } from '../events/errors.ts'
import { ProductError } from '../product/port.ts'
import { consumerAlive, consumerStats, deliveryHandler } from './amqp.ts'

const logger = pino({ level: 'silent' })
const properties = {
  exchange: 'user-activity',
  routingKey: 'com.twake.mail.user.active.v1',
  headers: {}
}

function run(error?: Error) {
  const stats = consumerStats()
  const handler = deliveryHandler(
    () => (error ? Promise.reject(error) : Promise.resolve()),
    stats,
    logger
  )
  return { stats, delivered: handler({}, properties) }
}

describe('deliveryHandler', () => {
  it('acks a handled event', async () => {
    const { stats, delivered } = run()
    await expect(delivered).resolves.toBeUndefined()
    expect(stats.outcomes.get('handled')).toBe(1)
  })

  it('acks and drops a malformed event', async () => {
    const { stats, delivered } = run(new MalformedEventError('no time'))
    await expect(delivered).resolves.toBeUndefined()
    expect(stats.outcomes.get('dropped')).toBe(1)
  })

  it('dead letters a rejected event at once', async () => {
    const { stats, delivered } = run(new RejectedEventError('no site'))
    await expect(delivered).rejects.toBeInstanceOf(DeadLetterError)
    expect(stats.outcomes.get('dead_lettered')).toBe(1)
  })

  it('lets the client retry any other failure', async () => {
    const down = new ProductError('down', 'transient')
    const { stats, delivered } = run(down)
    await expect(delivered).rejects.toBe(down)
    expect(stats.outcomes.get('failed')).toBe(1)
  })
})

describe('consumerAlive', () => {
  it('is alive while connected and subscribed', () => {
    const stats = consumerStats()
    stats.subscribed(true)
    expect(consumerAlive({ isConnected: () => true }, stats)()).toBe(true)
  })

  it('is not alive once a subscription is lost', () => {
    const stats = consumerStats()
    stats.subscribed(false)
    expect(consumerAlive({ isConnected: () => true }, stats)()).toBe(false)
  })
})
