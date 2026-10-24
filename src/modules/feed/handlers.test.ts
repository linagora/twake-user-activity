import { describe, expect, it } from 'vitest'
import type { Hit } from '../../product/port.ts'
import { pseudonym } from '../activity/handlers.ts'
import { feedSource } from './handlers.ts'

const PEPPER = 'a-pepper-that-is-at-least-32-characters'
const properties = { exchange: 'activity', routingKey: '', headers: {} }

const event = (overrides: Record<string, unknown> = {}) => ({
  specversion: '1.0',
  id: '0192f0c2-0000-7000-8000-000000000001',
  source: 'twake://tasks',
  type: 'com.twake.tasks.task.assigned.v1',
  time: '2026-10-24T10:30:00Z',
  twakeactor: 'Alice@Example.com',
  twakeorg: 'linagora',
  data: { object: { id: 't1' } },
  ...overrides
})

function source(tracked = ['tasks', 'mail']) {
  const hits: Hit[] = []
  const { handle } = feedSource('activity', {
    pepper: PEPPER,
    track: hit => {
      hits.push(hit)
      return Promise.resolve()
    },
    tracks: app => tracked.includes(app)
  })
  return { hits, handle: (body: unknown) => handle(body, properties) }
}

describe('feedSource', () => {
  it('counts what a person did, named after the object and action', async () => {
    const { hits, handle } = source()
    await handle(event())
    expect(hits).toEqual([
      {
        app: 'tasks',
        user: pseudonym('alice@example.com', PEPPER),
        time: new Date('2026-10-24T10:30:00Z'),
        category: 'unclassified',
        action: 'task.assigned',
        tenant: 'linagora'
      }
    ])
  })

  it.each([
    ['no actor, as with an organization token', { twakeactor: undefined }],
    ['no time', { time: undefined }],
    ['a provisioned space', { type: 'com.twake.mail.space.provisioned.v1' }],
    [
      'an app the backend has no report for',
      { type: 'com.twake.pages.page.created.v1' }
    ],
    ['the reserved billing app', { type: 'com.twake.billing.plan.changed.v1' }],
    ['a type outside the convention', { type: 'com.twake.tasks.created' }],
    ['the heartbeat', { type: 'com.twake.tasks.user.active.v1' }],
    ['an actor that is not an address', { twakeactor: 'alice' }]
  ])('skips an event with %s', async (_name, overrides) => {
    const { hits, handle } = source()
    await expect(handle(event(overrides))).resolves.toBeUndefined()
    expect(hits).toEqual([])
  })

  it('skips a message that is not a CloudEvent, which is the apps to fix', async () => {
    const { hits, handle } = source()
    await expect(handle({ hello: 'world' })).resolves.toBeUndefined()
    expect(hits).toEqual([])
  })
})
