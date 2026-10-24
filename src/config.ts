import { z } from 'zod'

// Number('') is 0, so a blank value would pass as a count of zero.
const count = (min: number) =>
  z.string().trim().min(1).pipe(z.coerce.number<string>().int().min(min))

const port = count(1).pipe(z.number().max(65535))

const json = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown
  } catch {
    ctx.addIssue({ code: 'custom', message: 'must be JSON' })
    return z.NEVER
  }
})

export const appName = z.string().regex(/^[a-z][a-z0-9-]*$/)

// For example {"cozy":1,"chat":2,"mail":3,"sso":4}.
const sites = json.pipe(
  z
    .record(appName, z.number().int().min(1))
    .refine(sites => Object.keys(sites).length > 0, 'needs at least one app')
)

const HOURS_72_MS = 72 * 3_600_000

const BACKEND_KEYS = {
  matomo: ['MATOMO_URL', 'MATOMO_TOKEN', 'MATOMO_SITES'],
  posthog: ['POSTHOG_HOST', 'POSTHOG_API_KEY']
} as const

// Only the selected backend's keys are required, so switching is one variable.
const backend = z
  .object({
    ANALYTICS_BACKEND: z.enum(['matomo', 'posthog']).default('matomo'),
    MATOMO_URL: z.url({ protocol: /^https?$/ }).optional(),
    MATOMO_TOKEN: z.string().min(1).optional(),
    MATOMO_SITES: sites.optional(),
    MATOMO_TENANT_DIMENSION: count(1).optional(),
    POSTHOG_HOST: z.url({ protocol: /^https?$/ }).optional(),
    POSTHOG_API_KEY: z.string().min(1).optional()
  })
  .superRefine((env, ctx) => {
    for (const key of BACKEND_KEYS[env.ANALYTICS_BACKEND]) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `required with ANALYTICS_BACKEND=${env.ANALYTICS_BACKEND}`
        })
      }
    }
  })
  .transform(env => {
    if (env.ANALYTICS_BACKEND === 'posthog') {
      return {
        backend: {
          kind: 'posthog' as const,
          host: env.POSTHOG_HOST ?? '',
          apiKey: env.POSTHOG_API_KEY ?? ''
        }
      }
    }
    return {
      backend: {
        kind: 'matomo' as const,
        url: env.MATOMO_URL ?? '',
        token: env.MATOMO_TOKEN ?? '',
        sites: env.MATOMO_SITES ?? {},
        ...(env.MATOMO_TENANT_DIMENSION !== undefined && {
          tenantDimension: env.MATOMO_TENANT_DIMENSION
        })
      }
    }
  })

export type Backend = z.infer<typeof backend>['backend']

const configSchema = z
  .object({
    AMQP_URL: z.url({ protocol: /^amqps?$/ }),
    AMQP_EXCHANGE: z.string().min(1).default('user-activity'),
    AMQP_QUEUE: z.string().min(1).default('user-activity.ingest'),
    AMQP_DEAD_LETTER_EXCHANGE: z.string().min(1).optional(),
    AMQP_PREFETCH: count(1).default(100),
    AMQP_MESSAGE_TTL_MS: count(1).default(HOURS_72_MS),
    // Failures retry in the process, so a redelivery means a crash or a
    // consumer_timeout.
    AMQP_DELIVERY_LIMIT: count(1).default(20),
    ANALYTICS_TIMEOUT_MS: count(1).default(10_000),
    BATCH_SIZE: count(1).default(100),
    BATCH_WAIT_MS: count(0).default(1000),
    PSEUDONYM_PEPPER: z.string().min(32),
    HTTP_HOST: z.string().min(1).default('0.0.0.0'),
    HTTP_PORT: port.default(8080),
    METRICS_PORT: port.default(9464),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info')
  })
  .superRefine((env, ctx) => {
    // A batch fills only from the deliveries a replica holds.
    if (env.BATCH_SIZE > env.AMQP_PREFETCH) {
      ctx.addIssue({
        code: 'custom',
        path: ['BATCH_SIZE'],
        message: 'must not exceed AMQP_PREFETCH'
      })
    }
  })
  .and(backend)
  .transform(env => ({
    ...env,
    AMQP_DEAD_LETTER_EXCHANGE:
      env.AMQP_DEAD_LETTER_EXCHANGE ?? `${env.AMQP_QUEUE}.dlx`
  }))

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
