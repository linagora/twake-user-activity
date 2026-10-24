import type { Backend } from '../config.ts'
import { matomoTracker } from './matomo.ts'
import type { CallStats, Tracker } from './port.ts'
import { posthogTracker } from './posthog.ts'

export function createTracker(
  backend: Backend,
  options: { timeoutMs: number; stats?: CallStats }
): Tracker {
  switch (backend.kind) {
    case 'matomo':
      return matomoTracker({ ...backend, ...options })
    case 'posthog':
      return posthogTracker({ ...backend, ...options })
  }
}
