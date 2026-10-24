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

interface PostOptions {
  timeoutMs: number
  fetch?: typeof fetch
  stats?: CallStats
  headers?: Record<string, string>
}

export const postJson = (
  url: URL,
  body: unknown,
  options: PostOptions
): Promise<Posted> =>
  post(url, JSON.stringify(body), {
    ...options,
    headers: { ...options.headers, 'content-type': 'application/json' }
  })

// Matomo's reporting API reads form fields, not JSON.
export const postForm = (
  url: URL,
  fields: URLSearchParams,
  options: PostOptions
): Promise<Posted> => post(url, fields, options)

// Throws ProductError for an unreachable backend or a non-2xx answer; the
// caller reads a 2xx body and calls `done` itself.
async function post(
  url: URL,
  body: string | URLSearchParams,
  options: PostOptions
): Promise<Posted> {
  const started = performance.now()
  const done = (result: string) => {
    options.stats?.record(result, (performance.now() - started) / 1000)
  }
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(url, {
      method: 'POST',
      ...(options.headers !== undefined && { headers: options.headers }),
      body,
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
