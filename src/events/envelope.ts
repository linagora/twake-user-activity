import { z } from 'zod'

const key = z.string().min(1).max(255)

const cloudEvent = z.looseObject({
  specversion: z.literal('1.0'),
  id: key,
  source: key,
  type: key,
  time: z.iso.datetime({ offset: true }).optional(),
  // A B2C user has no organization.
  twakeorg: key.optional(),
  twakeactorid: key.optional(),
  twakeactor: z.email().optional(),
  data: z.looseObject({}).optional()
})

export type CloudEvent = z.infer<typeof cloudEvent>

export type ParseResult<T> =
  { ok: true; event: T } | { ok: false; error: string }

export function parseCloudEvent(body: unknown): ParseResult<CloudEvent> {
  const result = cloudEvent.safeParse(body)
  return result.success
    ? { ok: true, event: result.data }
    : { ok: false, error: z.prettifyError(result.error) }
}
