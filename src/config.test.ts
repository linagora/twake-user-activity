import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

const base = {
  AMQP_URL: 'amqp://guest:guest@localhost:5672',
  PSEUDONYM_PEPPER: 'a-pepper-that-is-at-least-32-characters'
}
const matomo = {
  ...base,
  MATOMO_URL: 'https://matomo.example.com',
  MATOMO_TOKEN: 'token',
  MATOMO_SITES: '{"mail":3,"chat":2}'
}

describe('loadConfig', () => {
  it('defaults to Matomo, with the topology of ADR 045', () => {
    const config = loadConfig(matomo)
    expect(config.backend).toEqual({
      kind: 'matomo',
      url: 'https://matomo.example.com',
      token: 'token',
      sites: { mail: 3, chat: 2 },
      dimensions: {}
    })
    expect(config.AMQP_EXCHANGE).toBe('user-activity')
    expect(config.AMQP_QUEUE).toBe('user-activity.ingest')
    expect(config.AMQP_DEAD_LETTER_EXCHANGE).toBe('user-activity.ingest.dlx')
    expect(config.AMQP_MESSAGE_TTL_MS).toBe(72 * 3_600_000)
    expect(config.HTTP_PORT).toBe(8080)
  })

  it('switches to PostHog with one variable and its own keys only', () => {
    const config = loadConfig({
      ...base,
      ANALYTICS_BACKEND: 'posthog',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
      POSTHOG_API_KEY: 'phc_key'
    })
    expect(config.backend).toEqual({
      kind: 'posthog',
      host: 'https://eu.i.posthog.com',
      apiKey: 'phc_key'
    })
  })

  it('names every missing key of the selected backend', () => {
    expect(() => loadConfig({ ...base, ANALYTICS_BACKEND: 'posthog' })).toThrow(
      /POSTHOG_HOST[\s\S]*POSTHOG_API_KEY/
    )
    expect(() => loadConfig(base)).toThrow(/MATOMO_URL/)
  })

  it('refuses sites that are not a JSON map of app to site id', () => {
    expect(() => loadConfig({ ...matomo, MATOMO_SITES: 'mail=3' })).toThrow(
      /must be JSON/
    )
    expect(() => loadConfig({ ...matomo, MATOMO_SITES: '{}' })).toThrow(
      /at least one app/
    )
    expect(() => loadConfig({ ...matomo, MATOMO_SITES: '{"Mail":3}' })).toThrow(
      /MATOMO_SITES/
    )
  })

  it('needs a Matomo site for billing only when billing is on', () => {
    expect(loadConfig(matomo).BILLING_EXCHANGE).toBeUndefined()
    expect(
      loadConfig({ ...matomo, BILLING_EXCHANGE: '' }).BILLING_EXCHANGE
    ).toBeUndefined()
    expect(() =>
      loadConfig({ ...matomo, BILLING_EXCHANGE: 'billing' })
    ).toThrow(/"billing" site[\s\S]*MATOMO_SITES/)
    expect(
      loadConfig({
        ...matomo,
        BILLING_EXCHANGE: 'billing',
        MATOMO_SITES: '{"mail":3,"billing":5}'
      }).BILLING_EXCHANGE
    ).toBe('billing')
    expect(() =>
      loadConfig({
        ...matomo,
        BILLING_EXCHANGE: 'user-activity',
        MATOMO_SITES: '{"mail":3,"billing":5}'
      })
    ).toThrow(/BILLING_EXCHANGE/)
    expect(() =>
      loadConfig({
        ...matomo,
        BILLING_EXCHANGE: 'billing',
        FEED_EXCHANGE: 'billing',
        MATOMO_SITES: '{"mail":3,"billing":5}'
      })
    ).toThrow(/FEED_EXCHANGE/)
    expect(() =>
      loadConfig({ ...matomo, FEED_EXCHANGE: 'user-activity.ingest.dlx' })
    ).toThrow(/FEED_EXCHANGE/)
  })

  it('reads the Matomo dimensions and refuses unknown ones', () => {
    const config = loadConfig({
      ...matomo,
      MATOMO_DIMENSIONS: '{"tenant":1,"platform":2}'
    })
    expect(config.backend).toMatchObject({
      dimensions: { tenant: 1, platform: 2 }
    })
    expect(() =>
      loadConfig({ ...matomo, MATOMO_DIMENSIONS: '{"device":3}' })
    ).toThrow(/MATOMO_DIMENSIONS/)
    expect(() =>
      loadConfig({ ...matomo, MATOMO_DIMENSIONS: '{"tenant":1,"platform":1}' })
    ).toThrow(/MATOMO_DIMENSIONS/)
  })

  it('refuses a batch larger than the deliveries a replica holds', () => {
    expect(() =>
      loadConfig({ ...matomo, AMQP_PREFETCH: '10', BATCH_SIZE: '20' })
    ).toThrow(/BATCH_SIZE/)
  })

  it('refuses a short pepper and a blank count', () => {
    expect(() => loadConfig({ ...matomo, PSEUDONYM_PEPPER: 'short' })).toThrow(
      /PSEUDONYM_PEPPER/
    )
    expect(() => loadConfig({ ...matomo, AMQP_PREFETCH: '' })).toThrow(
      /AMQP_PREFETCH/
    )
  })
})
