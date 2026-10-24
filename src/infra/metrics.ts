import type { FastifyInstance } from 'fastify'
import type { ConsumerStats } from './amqp.ts'

export type BackendStats = ReturnType<typeof backendStats>

export function backendStats() {
  const calls = new Map<string, { count: number; seconds: number }>()
  return {
    calls,
    record(result: string, seconds: number) {
      const entry = calls.get(result) ?? { count: 0, seconds: 0 }
      entry.count++
      entry.seconds += seconds
      calls.set(result, entry)
    }
  }
}

export function registerMetrics(
  app: FastifyInstance,
  deps: { consumer: ConsumerStats; backend: string; calls: BackendStats }
): void {
  const labels = (result: string) =>
    `{backend="${deps.backend}",result="${result}"}`
  app.get('/metrics', (_request, reply) =>
    reply
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(
        [
          '# HELP twake_user_activity_events_total Handler attempts, by outcome; a retried message counts once per attempt.',
          '# TYPE twake_user_activity_events_total counter',
          ...[...deps.consumer.outcomes].map(
            ([outcome, total]) =>
              `twake_user_activity_events_total{outcome="${outcome}"} ${String(total)}`
          ),
          '# HELP twake_user_activity_backend_requests_seconds Analytics backend batch requests, by result.',
          '# TYPE twake_user_activity_backend_requests_seconds summary',
          ...[...deps.calls.calls].flatMap(([result, { count, seconds }]) => [
            `twake_user_activity_backend_requests_seconds_count${labels(result)} ${String(count)}`,
            `twake_user_activity_backend_requests_seconds_sum${labels(result)} ${String(seconds)}`
          ]),
          ''
        ].join('\n')
      )
  )
}
