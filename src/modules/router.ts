import type { Handle } from '../infra/amqp.ts'
import type { Hit } from '../product/port.ts'
import { activityHandler } from './activity/handlers.ts'
import { billingHandler } from './billing/handlers.ts'

// One queue carries both kinds of message; the exchange tells them apart. A
// message moved back from the dead letter queue arrives from another exchange,
// and RabbitMQ keeps the one it was first published to in a header.
export function routeMessages(deps: {
  pepper: string
  billingExchange?: string | undefined
  track: (hit: Hit) => Promise<void>
}): Handle {
  const activity = activityHandler(deps)
  const billing = billingHandler(deps)
  return (body, { exchange, headers, timestamp }) => {
    const firstDeath = headers['x-first-death-exchange']
    const source = typeof firstDeath === 'string' ? firstDeath : exchange
    return source === deps.billingExchange
      ? billing(
          body,
          timestamp === undefined ? undefined : new Date(timestamp * 1000)
        )
      : activity(body)
  }
}
