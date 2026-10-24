import { ProductError, type CallStats, type ProductFailure } from './port.ts'

export function failureOf(status: number): ProductFailure {
  if (status === 401 || status === 403) return 'credentials'
  if (status === 408 || status === 429 || status >= 500) return 'transient'
  return 'permanent'
}

export interface Posted {
  status: number
  body: unknown
  /** Records the call's result under `result`, timed from the start. */
  done: (result: string) => void
}

// Throws ProductError for an unreachable backend or a non-2xx answer; the
// caller reads a 2xx body and calls `done` itself.
export async function postJson(
  url: URL,
  body: unknown,
  options: { timeoutMs: number; fetch?: typeof fetch; stats?: CallStats }
): Promise<Posted> {
  const started = performance.now()
  const done = (result: string) => {
    options.stats?.record(result, (performance.now() - started) / 1000)
  }
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs)
    })
  } catch (error) {
    done('unreachable')
    throw new ProductError(`${url.host} is unreachable`, 'transient', {
      cause: error
    })
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    done(String(response.status))
    throw new ProductError(
      `${url.host} answered ${String(response.status)}`,
      failureOf(response.status)
    )
  }
  let parsed: unknown
  try {
    parsed = text === '' ? undefined : JSON.parse(text)
  } catch {
    parsed = undefined
  }
  return { status: response.status, body: parsed, done }
}

export const endpoint = (base: string, path: string): URL =>
  new URL(path, base.replace(/\/?$/, '/'))
