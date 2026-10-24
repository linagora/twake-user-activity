import { z } from 'zod'
import { endpoint, postJson } from './http.ts'
import { ProductError, type CallStats, type Hit, type Tracker } from './port.ts'

export interface MatomoOptions {
  url: string
  token: string
  /** One Matomo site per app, so per-app reports need no segment. */
  sites: Readonly<Record<string, number>>
  timeoutMs: number
  /** The Matomo custom dimension that stores each optional hit field. */
  dimensions: MatomoDimensions
  fetch?: typeof fetch
  stats?: CallStats
}

const bulkResponse = z.object({
  status: z.string(),
  invalid_indices: z.array(z.number().int()).optional()
})

const USER_AGENT = 'twake-user-activity'

export interface MatomoDimensions {
  tenant?: number | undefined
  platform?: number | undefined
}

export function trackingQuery(
  hit: Hit,
  site: number,
  dimensions: MatomoDimensions
): string {
  const params = new URLSearchParams({
    idsite: String(site),
    rec: '1',
    apiv: '1',
    send_image: '0',
    uid: hit.user,
    cdt: String(Math.floor(hit.time.getTime() / 1000)),
    e_c: hit.category,
    e_a: hit.action,
    // Matomo silently drops hits whose user agent looks like a bot, and
    // fetch's default "node" does.
    ua: USER_AGENT
  })
  // Only a token with write access may override the visitor's address.
  if (hit.ip !== undefined) params.set('cip', hit.ip)
  for (const field of ['tenant', 'platform'] as const) {
    const id = dimensions[field]
    const value = hit[field]
    if (id !== undefined && value !== undefined) {
      params.set(`dimension${String(id)}`, value)
    }
  }
  return `?${params.toString()}`
}

// The bulk endpoint, so a batch costs one request. A timestamp older than
// about a day is only accepted with token_auth, which every request carries,
// and invalid_indices is only returned to an authenticated request.
export function matomoTracker(options: MatomoOptions): Tracker {
  const url = endpoint(options.url, 'matomo.php')
  return {
    async track(hits) {
      const refused = new Set<number>()
      const sent: number[] = []
      const requests: string[] = []
      hits.forEach((hit, index) => {
        const site = Object.hasOwn(options.sites, hit.app)
          ? options.sites[hit.app]
          : undefined
        if (site === undefined) {
          refused.add(index)
          return
        }
        sent.push(index)
        requests.push(trackingQuery(hit, site, options.dimensions))
      })
      if (requests.length === 0) return { refused }

      const { status, body, done } = await postJson(
        url,
        { requests, token_auth: options.token },
        options
      )
      if (status === 204) {
        done('ok')
        return { refused }
      }
      const parsed = bulkResponse.safeParse(body)
      if (!parsed.success || parsed.data.status !== 'success') {
        done('error')
        throw new ProductError('Matomo did not track the batch', 'transient')
      }
      done('ok')
      for (const index of parsed.data.invalid_indices ?? []) {
        const original = sent[index]
        if (original !== undefined) refused.add(original)
      }
      return { refused }
    }
  }
}
