import { describe, expect, it } from 'vitest'
import { MalformedEventError } from '../../events/errors.ts'
import type { Hit } from '../../product/port.ts'
import { pseudonym } from '../activity/handlers.ts'
import { billingHandler } from './handlers.ts'

const PEPPER = 'a-pepper-that-is-at-least-32-characters'

function handler() {
  const hits: Hit[] = []
  const handle = billingHandler({
    pepper: PEPPER,
    track: hit => {
      hits.push(hit)
      return Promise.resolve()
    }
  })
  return { hits, handle }
}

// The payload cloudery's TwakeCom::Billing::SubscriptionChanged serializes.
const changed = (isPaying: unknown) => ({
  twakeId: 'alice',
  internalEmail: 'Alice@Example.com',
  isPaying,
  canUpgrade: true,
  features: { mail: {} }
})

describe('billingHandler', () => {
  it('records whether the user pays, under the same pseudonym as activity', async () => {
    const { hits, handle } = handler()
    const publishedAt = new Date('2026-10-24T10:30:00Z')
    await handle(changed(true), publishedAt)
    expect(hits).toEqual([
      {
        app: 'billing',
        user: pseudonym('alice@example.com', PEPPER),
        time: publishedAt,
        category: 'subscription',
        action: 'subscription-paying',
        paying: true
      }
    ])
    expect(JSON.stringify(hits)).not.toMatch(/alice/i)
  })

  it('records a move back to a free plan', async () => {
    const { hits, handle } = handler()
    await handle(changed(false))
    expect(hits[0]).toMatchObject({
      action: 'subscription-free',
      paying: false
    })
  })

  it.each([
    ['no paying status', changed(undefined)],
    [
      'a domain instead of a user',
      { domain: 'acme.example.com', isPaying: true }
    ]
  ])('drops a message with %s', async (_name, body) => {
    const { hits, handle } = handler()
    await expect(handle(body)).rejects.toBeInstanceOf(MalformedEventError)
    expect(hits).toEqual([])
  })
})
