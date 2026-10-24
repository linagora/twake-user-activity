import { describe, expect, it } from 'vitest'
import type { Hit } from '../product/port.ts'
import { routeMessages } from './router.ts'

function route() {
  const hits: Hit[] = []
  const handle = routeMessages({
    pepper: 'a-pepper-that-is-at-least-32-characters',
    billingExchange: 'billing',
    track: hit => {
      hits.push(hit)
      return Promise.resolve()
    }
  })
  return { hits, handle }
}

const changed = { internalEmail: 'alice@example.com', isPaying: true }

describe('routeMessages', () => {
  it('reads a billing message at its publish time', async () => {
    const { hits, handle } = route()
    await handle(changed, {
      exchange: 'billing',
      routingKey: 'subscription.changed',
      headers: {},
      timestamp: 1_790_000_000
    })
    expect(hits[0]).toMatchObject({
      app: 'billing',
      time: new Date(1_790_000_000_000)
    })
  })

  it('still reads a billing message moved back from the dead letter queue', async () => {
    const { hits, handle } = route()
    await handle(changed, {
      exchange: '',
      routingKey: 'user-activity.ingest',
      headers: { 'x-first-death-exchange': 'billing' }
    })
    expect(hits[0]).toMatchObject({ app: 'billing', paying: true })
  })
})
