import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RejectedEventError } from '../../events/errors.ts'
import { fakeTracker } from '../../product/fake.ts'
import { ProductError, type Hit } from '../../product/port.ts'
import { createBatcher } from './batch.ts'

const hit = (action: string): Hit => ({
  app: 'mail',
  user: 'u',
  time: new Date(0),
  category: 'unclassified',
  action
})

describe('createBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends a full batch at once, in one call', async () => {
    const tracker = fakeTracker()
    const batcher = createBatcher({ tracker, size: 2, waitMs: 1000 })
    await Promise.all([batcher.submit(hit('a')), batcher.submit(hit('b'))])
    expect(tracker.calls).toBe(1)
    expect(tracker.hits.map(h => h.action)).toEqual(['a', 'b'])
  })

  it('sends a partial batch once the wait is over', async () => {
    const tracker = fakeTracker()
    const batcher = createBatcher({ tracker, size: 10, waitMs: 1000 })
    const submitted = batcher.submit(hit('a'))
    await vi.advanceTimersByTimeAsync(999)
    expect(tracker.calls).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    await submitted
    expect(tracker.calls).toBe(1)
  })

  it('dead letters only the hits the backend refused', async () => {
    const tracker = fakeTracker()
    tracker.next = () => Promise.resolve({ refused: new Set([1]) })
    const batcher = createBatcher({ tracker, size: 2, waitMs: 1000 })
    const [first, second] = await Promise.allSettled([
      batcher.submit(hit('a')),
      batcher.submit(hit('b'))
    ])
    expect(first.status).toBe('fulfilled')
    expect(second).toMatchObject({
      status: 'rejected',
      reason: expect.any(RejectedEventError) as unknown
    })
  })

  it('fails every hit of a batch the backend could not take, to retry', async () => {
    const tracker = fakeTracker()
    const down = new ProductError('down', 'transient')
    tracker.next = () => Promise.reject(down)
    const batcher = createBatcher({ tracker, size: 2, waitMs: 1000 })
    const results = await Promise.allSettled([
      batcher.submit(hit('a')),
      batcher.submit(hit('b'))
    ])
    expect(results).toEqual([
      { status: 'rejected', reason: down },
      { status: 'rejected', reason: down }
    ])
  })

  it('splits a batch refused for good until only the bad hit is dead lettered', async () => {
    const tracker = {
      track: (hits: readonly Hit[]) =>
        hits.some(h => h.action === 'bad')
          ? Promise.reject(new ProductError('bad request', 'permanent'))
          : Promise.resolve({ refused: new Set<number>() })
    }
    const batcher = createBatcher({ tracker, size: 4, waitMs: 1000 })
    const results = await Promise.allSettled(
      ['a', 'b', 'bad', 'c'].map(action => batcher.submit(hit(action)))
    )
    expect(results.map(r => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'rejected',
      'fulfilled'
    ])
    expect(results[2]).toMatchObject({
      reason: expect.any(RejectedEventError) as unknown
    })
  })

  it('flush sends what is waiting without the wait', async () => {
    const tracker = fakeTracker()
    const batcher = createBatcher({ tracker, size: 10, waitMs: 60_000 })
    const submitted = batcher.submit(hit('a'))
    await batcher.flush()
    await submitted
    expect(tracker.hits).toHaveLength(1)
  })
})
