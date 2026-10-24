import { z } from 'zod'
import { BILLING_APP } from '../../config.ts'
import { MalformedEventError } from '../../events/errors.ts'
import { pseudonym } from '../activity/handlers.ts'
import type { Source, SourceDeps } from '../sources.ts'

export const ROUTING_KEY = 'subscription.changed'

// What cloudery publishes for a B2C instance: plain JSON, not a CloudEvent.
const subscriptionChanged = z.looseObject({
  internalEmail: z.email(),
  isPaying: z.boolean()
})

export function billingSource(exchange: string, deps: SourceDeps): Source {
  const handle = billingHandler(deps)
  return {
    exchange,
    routingKeys: [ROUTING_KEY],
    passive: true,
    // Cloudery stamps messages in seconds.
    handle: (body, { timestamp }) =>
      handle(
        body,
        timestamp === undefined ? undefined : new Date(timestamp * 1000)
      )
  }
}

export function billingHandler(
  deps: Pick<SourceDeps, 'pepper' | 'track'>
): (body: unknown, publishedAt?: Date) => Promise<void> {
  return async (body, publishedAt = new Date()) => {
    const parsed = subscriptionChanged.safeParse(body)
    if (!parsed.success) {
      throw new MalformedEventError(z.prettifyError(parsed.error))
    }
    const { internalEmail, isPaying } = parsed.data
    await deps.track({
      app: BILLING_APP,
      user: pseudonym(internalEmail, deps.pepper),
      time: publishedAt,
      category: 'subscription',
      action: isPaying ? 'subscription-paying' : 'subscription-free',
      paying: isPaying
    })
  }
}
