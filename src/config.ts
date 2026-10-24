import { z } from 'zod'

// Number('') is 0, so a blank value would pass as a count of zero.
const count = (min: number) =>
  z.string().trim().min(1).pipe(z.coerce.number<string>().int().min(min))

const port = count(1).pipe(z.number().max(65535))

const configSchema = z.object({
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: port.default(8080),
  METRICS_PORT: port.default(9464),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info')
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
