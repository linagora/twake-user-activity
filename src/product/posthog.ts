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
              // Every request comes from the bridge, so without the app's
              // address the request IP says nothing about where the user is.
              ...(hit.ip === undefined
                ? { $geoip_disable: true }
                : { $ip: hit.ip }),
              app: hit.app,
              category: hit.category,
              ...(hit.tenant !== undefined && { tenant: hit.tenant }),
              ...(hit.platform !== undefined && { platform: hit.platform }),
              // A person property, so insights can count paying users.
              ...(hit.paying !== undefined && { $set: { paying: hit.paying } })
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
