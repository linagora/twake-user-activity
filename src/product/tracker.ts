import type { Backend } from '../config.ts'
import { matomoTracker } from './matomo.ts'
import type { CallStats, Tracker } from './port.ts'
import { posthogTracker } from './posthog.ts'

// Matomo reports only on the apps it has a site for; PostHog on any.
export function reportsOn(backend: Backend): (app: string) => boolean {
  return backend.kind === 'matomo'
    ? app => Object.hasOwn(backend.sites, app)
    : () => true
}

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
