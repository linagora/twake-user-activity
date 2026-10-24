import { describe, expect, it } from 'vitest'
import { ProductError } from '../../product/port.ts'
import { pseudonym } from '../activity/handlers.ts'
import { erasureSource } from './handlers.ts'

const PEPPER = 'a-pepper-that-is-at-least-32-characters'
const properties = { headers: {} } as never

function source(forget: (user: string) => Promise<void>) {
  return erasureSource('b2b', 'domain.user.deleted', { pepper: PEPPER, forget })
}

// What ldap-rest's lifecycle rules publish for a deleted member.
const deleted = {
  emitter: 'ldap-rest',
  type: 'user.deleted',
  userId: 'alice',
  uuid: '6f1c0a52-8e3b-4d7f-a9c2-5b0e1d4f7a83',
  internalEmail: 'Alice@Example.com',
  organizationId: 'evilcorp123',
  reason: 'user deleted'
}

describe('erasureSource', () => {
  it('forgets the user under the same pseudonym as their activity', async () => {
    const forgotten: string[] = []
    await source(user => {
      forgotten.push(user)
      return Promise.resolve()
    }).handle(deleted, properties)
    expect(forgotten).toEqual([pseudonym('alice@example.com', PEPPER)])
  })

  it('drops a deletion that names no address', async () => {
    await expect(
      source(() => Promise.resolve()).handle(
        { ...deleted, internalEmail: undefined },
        properties
      )
    ).rejects.toMatchObject({ name: 'MalformedEventError' })
  })

  it('keeps an erasure the backend refuses for good in the dead letter queue', async () => {
    const refuse = () =>
      Promise.reject(new ProductError('Invalid segment', 'permanent'))
    await expect(
      source(refuse).handle(deleted, properties)
    ).rejects.toMatchObject({ name: 'RejectedEventError' })
  })

  it('retries an erasure the backend could not do yet', async () => {
    const down = () => Promise.reject(new ProductError('down', 'transient'))
    await expect(
      source(down).handle(deleted, properties)
    ).rejects.toMatchObject({ name: 'ProductError', failure: 'transient' })
  })
})
