import {
  DeadLetterError,
  RabbitMQClient,
  type RabbitMQMessageHandler,
  type RabbitMQMessageProperties,
  type SubscribeOptions
} from '@linagora/rabbitmq-client'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'
import { MalformedEventError, RejectedEventError } from '../events/errors.ts'
import { ROUTING_KEY as BILLING_ROUTING_KEY } from '../modules/billing/handlers.ts'
import { ProductError } from '../product/port.ts'

export type Outcome = 'handled' | 'dropped' | 'dead_lettered' | 'failed'

const FIRST_RETRY_MS = 1000
const MAX_RETRY_MS = 60_000
const STUCK_MS = 5 * 60_000
// The client reconnects on its own; a broker restart should not restart pods.
const DISCONNECTED_MS = 60_000

export type ConsumerStats = ReturnType<typeof consumerStats>

interface Handling {
  since: number
}

export function consumerStats() {
  const outcomes = new Map<Outcome, number>()
  const handling = new Set<Handling>()
  let subscribed = false
  return {
    outcomes,
    started(): Handling {
      const started = { since: Date.now() }
      handling.add(started)
      return started
    },
    ended(started: Handling, outcome: Outcome) {
      handling.delete(started)
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1)
    },
    // The client gives up on a subscription it fails to restore, and stays
    // connected without consuming.
    subscribed(ok: boolean) {
      subscribed = ok
    },
    isSubscribed: () => subscribed,
    stuck: () =>
      [...handling].some(({ since }) => Date.now() - since > STUCK_MS)
  }
}

// An idle consumer is alive: only a stuck handler, a lost connection or a lost
// subscription is not.
export function consumerAlive(
  client: Pick<RabbitMQClient, 'isConnected'>,
  stats: ConsumerStats
): () => boolean {
  let disconnectedSince: number | undefined
  return () => {
    if (client.isConnected()) disconnectedSince = undefined
    else disconnectedSince ??= Date.now()
    const lost =
      disconnectedSince !== undefined &&
      Date.now() - disconnectedSince > DISCONNECTED_MS
    return !lost && !stats.stuck() && stats.isSubscribed()
  }
}

export type Handle = (
  body: unknown,
  properties: RabbitMQMessageProperties
) => Promise<void>

export function deliveryHandler(
  handle: Handle,
  stats: ConsumerStats,
  logger: Logger
): RabbitMQMessageHandler {
  return async (body, properties) => {
    const { routingKey, messageId } = properties
    const started = stats.started()
    try {
      await handle(body, properties)
      stats.ended(started, 'handled')
    } catch (error) {
      const context = { routingKey, messageId, err: error }
      if (error instanceof MalformedEventError) {
        stats.ended(started, 'dropped')
        logger.warn(context, 'dropped a malformed event')
        return
      }
      if (error instanceof RejectedEventError) {
        stats.ended(started, 'dead_lettered')
        logger.warn(context, 'dead lettered a rejected event')
        throw new DeadLetterError(error.message, { cause: error })
      }
      stats.ended(started, 'failed')
      if (error instanceof ProductError && error.failure === 'credentials') {
        logger.error(context, 'the analytics backend refused our key')
      }
      throw error
    }
  }
}

export function subscription(config: Config) {
  return {
    deadLetterExchange: config.AMQP_DEAD_LETTER_EXCHANGE,
    maxRetries: Infinity,
    maxRetryDelay: MAX_RETRY_MS,
    ...(config.BILLING_EXCHANGE !== undefined && {
      bindings: [
        { exchange: config.BILLING_EXCHANGE, routingKey: BILLING_ROUTING_KEY }
      ]
    }),
    queueArguments: {
      'x-delivery-limit': config.AMQP_DELIVERY_LIMIT,
      // A backend outage longer than this dead letters the activity it covers.
      'x-message-ttl': config.AMQP_MESSAGE_TTL_MS
    }
  } satisfies SubscribeOptions
}

export async function startConsumer(
  config: Config,
  logger: Logger,
  stats: ConsumerStats,
  routingKey: string,
  handle: Handle
): Promise<RabbitMQClient> {
  const client = await connect(config, logger, stats)
  await client.subscribe(
    config.AMQP_EXCHANGE,
    routingKey,
    config.AMQP_QUEUE,
    deliveryHandler(handle, stats, logger),
    subscription(config)
  )
  stats.subscribed(true)
  return client
}

async function connect(
  config: Config,
  logger: Logger,
  stats: ConsumerStats
): Promise<RabbitMQClient> {
  const client = new RabbitMQClient({
    url: config.AMQP_URL,
    prefetch: config.AMQP_PREFETCH,
    retryDelay: FIRST_RETRY_MS,
    // A delivery waits for its batch and for one backend call at most.
    closeTimeout: config.BATCH_WAIT_MS + config.ANALYTICS_TIMEOUT_MS + 1000,
    // The client logs every message at info.
    logger: logger.child({ component: 'amqp' }, { level: 'warn' }),
    hooks: {
      onReconnect: ({ subscriptionsFailed }) => {
        stats.subscribed(subscriptionsFailed === 0)
      }
    }
  })
  await client.init()
  return client
}
