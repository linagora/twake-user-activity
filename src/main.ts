import * as Sentry from '@sentry/node'
import { createServer, handleSignals } from '@linagora/twake-node-server'
import { pino } from 'pino'
import { loadConfig } from './config.ts'

const SHUTDOWN_DEADLINE_MS = 25_000

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL })
const lifecycle = handleSignals({
  log: logger,
  deadlineMs: SHUTDOWN_DEADLINE_MS
})

let accepting = false
const server = createServer({
  logger,
  isReady: () => Promise.resolve(accepting)
})
await server.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT })
const metrics = createServer({ logger, isReady: () => Promise.resolve(true) })
metrics.get('/metrics', (_request, reply) =>
  reply.type('text/plain; version=0.0.4; charset=utf-8').send('')
)
await metrics.listen({ host: config.HTTP_HOST, port: config.METRICS_PORT })
accepting = true
logger.info('started')

lifecycle.started(async () => {
  accepting = false
  await Promise.all([server.close(), metrics.close()])
  await Sentry.flush(2000)
})
