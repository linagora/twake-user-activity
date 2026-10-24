import { z } from 'zod'
import { MalformedEventError, RejectedEventError } from '../../events/errors.ts'
import { ProductError } from '../../product/port.ts'
import { pseudonym } from '../activity/handlers.ts'
import type { Source, SourceDeps } from '../sources.ts'

// ldap-rest publishes the same payload under both keys.
export const ROUTING_KEYS = {
  auth: 'user.deleted',
  b2b: 'domain.user.deleted'
} as const

const userDeleted = z.looseObject({ internalEmail: z.email() })

export function erasureSource(
  exchange: string,
  routingKey: string,
  deps: Pick<SourceDeps, 'pepper' | 'forget'>
): Source {
  return {
    exchange,
    routingKeys: [routingKey],
    passive: true,
    handle: async body => {
      const parsed = userDeleted.safeParse(body)
      if (!parsed.success) {
        throw new MalformedEventError(z.prettifyError(parsed.error))
      }
      try {
        await deps.forget(pseudonym(parsed.data.internalEmail, deps.pepper))
      } catch (error) {
        // Kept in the dead letter queue: an erasure must not be lost.
        if (error instanceof ProductError && error.failure === 'permanent') {
          throw new RejectedEventError(error.message, { cause: error })
        }
        throw error
      }
    }
  }
}
