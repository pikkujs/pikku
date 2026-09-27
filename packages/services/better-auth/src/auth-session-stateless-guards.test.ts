import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  LocalSecretService,
  LocalVariablesService,
  ScopedSecretService,
} from '@pikku/core/services'

import { betterAuthStatelessSession } from './auth-session-stateless.js'

/**
 * The two ways this middleware has to stand down.
 *
 * See `a-session-middleware-stands-down-where-it-cannot-authenticate.md`.
 */

const EXISTING = { userId: 'u_already_here' }

async function run(opts: {
  secrets?: unknown
  /** What `getSession()` reports — the LIVE session, as the chain sees it. */
  live?: unknown
}) {
  const logged: string[] = []
  let nextCalled = false
  let setTo: unknown = undefined

  const services: any = {
    secrets: opts.secrets,
    logger: {
      error: (m: string) => logged.push(m),
      warn: (m: string) => logged.push(m),
      info() {},
    },
  }

  const wire: any = {
    http: {
      request: {
        header: () => undefined,
        headers: () => ({}),
      },
    },
    setSession: (s: unknown) => {
      setTo = s
    },
    // The build-time snapshot: undefined for the whole chain, whatever the
    // chain resolves. That is the trap `getSession` closes.
    session: undefined,
    getSession: () => opts.live,
  }

  const mw = betterAuthStatelessSession()
  await mw(services, wire, async () => {
    nextCalled = true
  })

  return { logged, nextCalled, setTo }
}

describe('betterAuthStatelessSession stands down', () => {
  test('when its secret is outside the scope this namespace was granted', async () => {
    const secrets = new ScopedSecretService(
      new LocalSecretService(new LocalVariablesService({ OTHER: 'v' })),
      new Set(['OTHER'])
    )

    const { nextCalled, setTo, logged } = await run({ secrets })

    assert.equal(nextCalled, true, 'the chain continues')
    assert.equal(setTo, undefined, 'no session is claimed')
    assert.deepEqual(logged, [], 'and it is not reported as a failure')
  })

  test('when the secret is missing, saying so once', async () => {
    const secrets = new LocalSecretService(new LocalVariablesService({}))

    const { nextCalled, setTo, logged } = await run({ secrets })

    assert.equal(nextCalled, true)
    assert.equal(setTo, undefined)
    assert.equal(logged.length, 1)
    assert.match(logged[0]!, /BETTER_AUTH_SECRET/)
  })

  test('when a middleware ahead of it already resolved a session', async () => {
    // The secret is readable, so only the live session stops it here.
    const secrets = new LocalSecretService(
      new LocalVariablesService({ BETTER_AUTH_SECRET: 'shhh' })
    )

    const { nextCalled, setTo } = await run({ secrets, live: EXISTING })

    assert.equal(nextCalled, true)
    assert.equal(setTo, undefined)
  })

  test('a genuine secret failure still surfaces', async () => {
    const secrets = {
      getSecret: async () => {
        throw new Error('connect ECONNREFUSED')
      },
    }

    await assert.rejects(() => run({ secrets }), /ECONNREFUSED/)
  })
})
