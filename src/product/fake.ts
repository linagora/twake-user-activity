import type { Hit, TrackResult, Tracker } from './port.ts'

export interface FakeTracker extends Tracker {
  hits: Hit[]
  calls: number
  /** Answers the next call instead of recording it. */
  next: ((hits: readonly Hit[]) => Promise<TrackResult>) | undefined
}

export function fakeTracker(): FakeTracker {
  const fake: FakeTracker = {
    hits: [],
    calls: 0,
    next: undefined,
    track(hits) {
      fake.calls++
      const answer = fake.next
      if (answer) {
        fake.next = undefined
        return answer(hits)
      }
      fake.hits.push(...hits)
      return Promise.resolve({ refused: new Set() })
    }
  }
  return fake
}
