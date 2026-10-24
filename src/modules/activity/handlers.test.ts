import { describe, expect, it } from 'vitest'
import { MalformedEventError } from '../../events/errors.ts'
import type { Hit } from '../../product/port.ts'
import { activityHandler, pseudonym } from './handlers.ts'

const PEPPER = 'a-pepper-that-is-at-least-32-characters'

const event = (overrides: Record<string, unknown> = {}) => ({
  specversion: '1.0',
  id: '0192f0c2-0000-7000-8000-000000000001',
  source: 'twake://registration',
  type: 'com.twake.mail.user.active.v1',
  time: '2026-10-24T10:30:00Z',
  twakeactor: 'Alice@Example.com',
  twakeactorid: '6f1c1b5e-0000-4000-8000-000000000001',
  twakeorg: 'org.example.com',
  data: { category: 'background', action: 'email.read', platform: 'desktop' },
  ...overrides
})

function handler() {
  const hits: Hit[] = []
  const handle = activityHandler({
    pepper: PEPPER,
    track: hit => {
      hits.push(hit)
      return Promise.resolve()
    }
  })
  return { hits, handle }
}

describe('activityHandler', () => {
  it('turns an activity event into a pseudonymous hit for its app', async () => {
    const { hits, handle } = handler()
    await handle(event())
    expect(hits).toEqual([
      {
        app: 'mail',
        user: pseudonym('alice@example.com', PEPPER),
        time: new Date('2026-10-24T10:30:00Z'),
        category: 'background',
        action: 'email.read',
        tenant: 'org.example.com',
        platform: 'desktop'
      }
    ])
    expect(JSON.stringify(hits)).not.toMatch(/alice/i)
  })

  it('fills the category and action an app left out', async () => {
    const { hits, handle } = handler()
    await handle(event({ data: undefined, twakeorg: undefined }))
    expect(hits[0]).toMatchObject({
      category: 'unclassified',
      action: 'activity'
    })
    expect(hits[0]).not.toHaveProperty('tenant')
    expect(hits[0]).not.toHaveProperty('platform')
  })

  it.each([
    ['no time', { time: undefined }],
    ['no actor', { twakeactor: undefined }],
    ['another event type', { type: 'com.twake.mail.user.created.v1' }],
    ['an unknown category', { data: { category: 'idle' } }],
    ['an unknown platform', { data: { platform: 'tv' } }],
    ['not a CloudEvent', { specversion: '0.3' }]
  ])('drops an event with %s', async (_name, overrides) => {
    const { hits, handle } = handler()
    await expect(handle(event(overrides))).rejects.toBeInstanceOf(
      MalformedEventError
    )
    expect(hits).toEqual([])
  })
})

describe('pseudonym', () => {
  it('is the same for one address in any case, and differs per pepper', () => {
    expect(pseudonym(' Bob@Example.com', PEPPER)).toBe(
      pseudonym('bob@example.com', PEPPER)
    )
    expect(pseudonym('bob@example.com', `${PEPPER}!`)).not.toBe(
      pseudonym('bob@example.com', PEPPER)
    )
    expect(pseudonym('bob@example.com', PEPPER)).toMatch(/^[0-9a-f]{64}$/)
  })
})
