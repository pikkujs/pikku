import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { resolveAuditUsers } from './resolve-audit-users.js'

type User = { name?: string; email?: string; actor?: boolean }

/**
 * A stand-in for better-auth exposing only what the resolver reaches for, plus
 * a record of the ids it was asked about — the dedupe is only observable there.
 */
const fakeAuth = (
  users: Record<string, User | Error | undefined>,
  asked: string[] = []
) =>
  (async () => ({
    $context: Promise.resolve({
      internalAdapter: {
        findUserById: async (id: string) => {
          asked.push(id)
          const user = users[id]
          if (user instanceof Error) throw user
          return user
        },
      },
    }),
  })) as any

const silentLogger = {
  warn: () => {},
  debug: () => {},
} as any

describe('resolveAuditUsers', () => {
  test('names the ids it was given', async () => {
    const directory = await resolveAuditUsers(
      fakeAuth({
        usr_1: { name: 'Ada', email: 'ada@example.com' },
        usr_2: { email: 'bob@example.com' },
      }),
      ['usr_1', 'usr_2']
    )
    assert.deepEqual(directory, {
      usr_1: { name: 'Ada', email: 'ada@example.com', actor: undefined },
      usr_2: { name: undefined, email: 'bob@example.com', actor: undefined },
    })
  })

  test('asks about each id once, however often a page repeats it', async () => {
    const asked: string[] = []
    await resolveAuditUsers(fakeAuth({ usr_1: { name: 'Ada' } }, asked), [
      'usr_1',
      'usr_1',
      undefined,
      'usr_1',
    ])
    assert.deepEqual(asked, ['usr_1'])
  })

  test('flags a scenario actor so synthetic traffic is not read as real', async () => {
    const directory = await resolveAuditUsers(
      fakeAuth({ usr_1: { name: 'Admin', actor: true } }),
      ['usr_1']
    )
    assert.equal(directory.usr_1?.actor, true)
  })

  test('leaves an ordinary user unflagged rather than false', async () => {
    const directory = await resolveAuditUsers(
      fakeAuth({ usr_1: { name: 'Ada', actor: false } }),
      ['usr_1']
    )
    assert.equal(directory.usr_1?.actor, undefined)
  })

  test('omits an account deleted since the event, leaving the id to show', async () => {
    const directory = await resolveAuditUsers(fakeAuth({ usr_1: undefined }), [
      'usr_1',
    ])
    assert.deepEqual(directory, {})
  })

  test('one unreadable row does not cost the page its other names', async () => {
    const directory = await resolveAuditUsers(
      fakeAuth({
        usr_1: new Error('row is gone'),
        usr_2: { name: 'Bob' },
      }),
      ['usr_1', 'usr_2'],
      silentLogger
    )
    assert.deepEqual(Object.keys(directory), ['usr_2'])
  })

  test('an app without auth resolves nothing rather than throwing', async () => {
    assert.deepEqual(await resolveAuditUsers(undefined, ['usr_1']), {})
  })

  test('skips the lookup entirely when the page named nobody', async () => {
    const asked: string[] = []
    await resolveAuditUsers(fakeAuth({}, asked), [undefined, undefined])
    assert.deepEqual(asked, [])
  })

  test('warns and falls back to ids when auth itself fails', async () => {
    const warnings: string[] = []
    const directory = await resolveAuditUsers(
      (async () => {
        throw new Error('auth is down')
      }) as any,
      ['usr_1'],
      { warn: (m: string) => warnings.push(m), debug: () => {} } as any
    )
    assert.deepEqual(directory, {})
    assert.equal(warnings.length, 1, 'the failure is reported, not swallowed')
    assert.match(warnings[0]!, /auth is down/)
  })

  test('resolves nothing when the adapter cannot look users up', async () => {
    const directory = await resolveAuditUsers(
      (async () => ({
        $context: Promise.resolve({ internalAdapter: {} }),
      })) as any,
      ['usr_1']
    )
    assert.deepEqual(directory, {})
  })
})
