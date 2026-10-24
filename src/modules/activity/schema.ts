import { z } from 'zod'
import { appName } from '../../config.ts'
import type { CloudEvent } from '../../events/envelope.ts'
import { PLATFORMS, type Platform } from '../../product/port.ts'

export const TYPE_PATTERN = /^com\.twake\.([^.]+)\.user\.active\.v1$/

// What the topic binding matches: the destination app is one word.
export const ROUTING_KEY = 'com.twake.*.user.active.v1'

const activity = z.object({
  type: z.string().regex(TYPE_PATTERN),
  time: z.iso.datetime({ offset: true }),
  twakeactor: z.email(),
  twakeactorid: z.string().optional(),
  twakeorg: z.string().optional(),
  data: z
    .object({
      category: z.enum(['background', 'foreground']).optional(),
      action: z.string().min(1).max(255).optional(),
      platform: z.enum(PLATFORMS).optional(),
      ip: z.union([z.ipv4(), z.ipv6()]).optional()
    })
    .default({})
})

export interface Activity {
  app: string
  email: string
  time: Date
  category?: 'background' | 'foreground'
  action?: string
  platform?: Platform
  ip?: string
  org?: string
}

export type ActivityResult =
  { ok: true; activity: Activity } | { ok: false; error: string }

export function parseActivity(event: CloudEvent): ActivityResult {
  const result = activity.safeParse(event)
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) }
  }
  const { type, time, twakeactor, twakeorg, data } = result.data
  const app = appName.safeParse(TYPE_PATTERN.exec(type)?.[1])
  if (!app.success) return { ok: false, error: `bad app in ${type}` }
  return {
    ok: true,
    activity: {
      app: app.data,
      email: twakeactor,
      time: new Date(time),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.action !== undefined && { action: data.action }),
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.ip !== undefined && { ip: data.ip }),
      ...(twakeorg !== undefined && { org: twakeorg })
    }
  }
}
