import { z } from 'zod'
import { appName, BILLING_APP } from '../../config.ts'
import { pseudonym, UNCLASSIFIED } from '../activity/handlers.ts'
import type { Source, SourceDeps } from '../sources.ts'

const TYPE_PATTERN = /^com\.twake\.([^.]+)\.([^.]+)\.([^.]+)\.v\d+$/

// Only the fields a hit needs. The feed belongs to the apps, so an event the
// bridge cannot use is skipped, never reported as malformed.
const feedEvent = z.looseObject({
  type: z.string(),
  time: z.iso.datetime({ offset: true }),
  twakeactor: z.email(),
  twakeorg: z.string().min(1).max(255).optional()
})

export function feedSource(
  exchange: string,
  deps: Pick<SourceDeps, 'pepper' | 'track' | 'tracks'>
): Source {
  return {
    exchange,
    routingKeys: ['com.twake.#'],
    passive: true,
    handle: async body => {
      // No actor means nobody acted, or an organization token did.
      const parsed = feedEvent.safeParse(body)
      if (!parsed.success) return
      const { type, time, twakeactor, twakeorg } = parsed.data
      const [, app = '', object = '', action = ''] =
        TYPE_PATTERN.exec(type) ?? []
      if (
        !appName.safeParse(app).success ||
        app === BILLING_APP ||
        // Set up by the platform, not done by a person.
        object === 'space' ||
        // The activity source already reads the heartbeat.
        (object === 'user' && action === 'active') ||
        !deps.tracks(app)
      ) {
        return
      }
      await deps.track({
        app,
        user: pseudonym(twakeactor, deps.pepper),
        time: new Date(time),
        category: UNCLASSIFIED,
        action: `${object}.${action}`,
        ...(twakeorg !== undefined && { tenant: twakeorg })
      })
    }
  }
}
