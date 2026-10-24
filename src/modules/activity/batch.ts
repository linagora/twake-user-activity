import { RejectedEventError } from '../../events/errors.ts'
import { ProductError, type Hit, type Tracker } from '../../product/port.ts'

interface Pending {
  hit: Hit
  resolve: () => void
  reject: (error: unknown) => void
}

export interface Batcher {
  /** Resolves once the product accepted the hit, so its delivery can be acked. */
  submit(hit: Hit): Promise<void>
  /** Sends what is waiting and waits for every batch in flight. */
  flush(): Promise<void>
}

// Each delivery waits for the batch it joined. A failed batch fails every
// hit in it, and each delivery retries on its own into a later batch.
export function createBatcher(deps: {
  tracker: Tracker
  size: number
  waitMs: number
}): Batcher {
  let pending: Pending[] = []
  let timer: NodeJS.Timeout | undefined
  const inFlight = new Set<Promise<void>>()

  const send = (batch: Pending[]): Promise<void> =>
    deps.tracker.track(batch.map(p => p.hit)).then(
      ({ refused }) => {
        batch.forEach((p, index) => {
          if (refused.has(index)) {
            p.reject(new RejectedEventError('the backend refused the event'))
          } else {
            p.resolve()
          }
        })
      },
      async (error: unknown) => {
        const permanent =
          error instanceof ProductError && error.failure === 'permanent'
        // One bad hit fails the whole request, so halve the batch until the
        // refusal lands on the hits that cause it.
        if (permanent && batch.length > 1) {
          const half = Math.ceil(batch.length / 2)
          await Promise.all([
            send(batch.slice(0, half)),
            send(batch.slice(half))
          ])
          return
        }
        const failure = permanent
          ? new RejectedEventError('the backend refused the event', {
              cause: error
            })
          : error
        for (const p of batch) p.reject(failure)
      }
    )

  const dispatch = (): void => {
    clearTimeout(timer)
    timer = undefined
    if (pending.length === 0) return
    const batch = pending
    pending = []
    const sent = send(batch).finally(() => inFlight.delete(sent))
    inFlight.add(sent)
  }

  return {
    submit(hit) {
      return new Promise<void>((resolve, reject) => {
        pending.push({ hit, resolve, reject })
        if (pending.length >= deps.size) dispatch()
        else timer ??= setTimeout(dispatch, deps.waitMs)
      })
    },
    async flush() {
      dispatch()
      await Promise.all(inFlight)
    }
  }
}
