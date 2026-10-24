export interface Recorded {
  url: string
  body: unknown
}

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
      body: JSON.parse(typeof init?.body === 'string' ? init.body : 'null')
    })
    const next = responses.shift()
    if (!next) throw new Error('unexpected call')
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }
  return { fetch, calls }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status })
