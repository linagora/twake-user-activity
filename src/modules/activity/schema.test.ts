import { describe, expect, it } from 'vitest'
import type { CloudEvent } from '../../events/envelope.ts'
import { parseActivity } from './schema.ts'

const VISIT = '3f2b8c1e-9d4a-4b6e-8f1a-2c3d4e5f6a7b'

// A Chat event: fully anonymous, no actor.
const chatEvent = (data: Record<string, unknown>) =>
  ({
    specversion: '1.0',
    id: '0192f0c2-0000-7000-8000-000000000002',
    source: 'twake://chat',
    type: 'com.twake.chat.user.active.v1',
    time: '2026-11-25T10:30:00Z',
    data: { category: 'foreground', action: 'button.clicked', ...data }
  }) as unknown as CloudEvent

describe('the visit of an activity', () => {
  it('keeps a valid UUID v4 as the visit of the activity', () => {
    const parsed = parseActivity(chatEvent({ visit: VISIT }))
    expect(parsed).toMatchObject({ ok: true, activity: { visit: VISIT } })
  })

  it('has no visit when the event sends none', () => {
    const parsed = parseActivity(chatEvent({}))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.activity).not.toHaveProperty('visit')
  })

  it.each([
    ['not a UUID', 'not-a-uuid'],
    ['an empty string', ''],
    ['a number', 42],
    ['an object', { id: VISIT }],
    ['null', null],
    ['a UUID with extra text', `${VISIT}x`]
  ])(
    'keeps the event but drops a visit that is %s',
    (_name, visit: unknown) => {
      const parsed = parseActivity(chatEvent({ visit }))
      expect(parsed).toMatchObject({
        ok: true,
        activity: { app: 'chat', action: 'button.clicked' }
      })
      if (parsed.ok) expect(parsed.activity).not.toHaveProperty('visit')
    }
  )
})
