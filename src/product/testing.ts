export interface Recorded {
  url: string
  body: unknown
  headers: Record<string, string>
}

// A form arrives as its fields, so tests compare plain objects either way.
const decode = (body: RequestInit['body']): unknown =>
  body instanceof URLSearchParams
    ? Object.fromEntries(body)
    : JSON.parse(typeof body === 'string' ? body : 'null')

/** A fetch that answers each call with the next response, and records it. */
export function stubFetch(...responses: (Response | Error)[]) {
  const calls: Recorded[] = []
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls.push({
      url:
        input instanceof URL
          ? input.toString()
          : typeof input === 'string'
            ? input
            : input.url,
      body: decode(init?.body),
      headers: Object.fromEntries(new Headers(init?.headers))
    })
    const next = responses.shift()
    if (!next) throw new Error('unexpected call')
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }
  return { fetch, calls }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status })
