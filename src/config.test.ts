import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('defaults the ports and the log level', () => {
    expect(loadConfig({})).toEqual({
      HTTP_HOST: '0.0.0.0',
      HTTP_PORT: 8080,
      METRICS_PORT: 9464,
      LOG_LEVEL: 'info'
    })
  })

  it('names every invalid key', () => {
    expect(() => loadConfig({ HTTP_PORT: '', LOG_LEVEL: 'loud' })).toThrow(
      /HTTP_PORT[\s\S]*LOG_LEVEL/
    )
  })
})
