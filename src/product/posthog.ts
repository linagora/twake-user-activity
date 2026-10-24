import { endpoint, postJson } from './http.ts'
import type { CallStats, Tracker } from './port.ts'

export interface PostHogOptions {
  host: string
  /** The project API key, which only allows capturing events. */
  apiKey: string
  timeoutMs: number
  fetch?: typeof fetch
  stats?: CallStats
}

// PostHog answers 200 even for events that fail its validation, so it never
// refuses a single hit: the whole batch passes or fails.
export function posthogTracker(options: PostHogOptions): Tracker {
  const url = endpoint(options.host, 'batch/')
  return {
    async track(hits) {
      const { done } = await postJson(
        url,
        {
          api_key: options.apiKey,
          batch: hits.map(hit => ({
            event: hit.action,
            distinct_id: hit.user,
            timestamp: hit.time.toISOString(),
            properties: {
              app: hit.app,
              category: hit.category,
              ...(hit.tenant !== undefined && { tenant: hit.tenant }),
              ...(hit.platform !== undefined && { platform: hit.platform })
            }
          }))
        },
        options
      )
      done('ok')
      return { refused: new Set() }
    }
  }
}
