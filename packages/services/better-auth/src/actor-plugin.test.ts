import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { deriveActorSecret } from '@pikku/core/services'

import { pikkuActor } from './actor-plugin.js'
import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  ACTOR_SIGN_IN_OPT_IN_VALUE,
  DEV_ACTOR_SIGN_IN_ENV,
} from './actor-sign-in-gate.js'
import { stampActorFlag } from './stamp-actor-flag.js'

/**
 * A root long enough to be key material — every persona's credential is derived
 * from it, so the plugin refuses anything shorter than 32 characters.
 */
const ROOT = 'flow-secret-flow-secret-flow-secret'

/** What a caller actually presents: the credential for that one address. */
const credentialFor = (email: string) => deriveActorSecret(ROOT, email)

const recordingLogger = () => {
  const info: string[] = []
  const warn: string[] = []
  return {
    info: (m: any) => info.push(String(m)),
    warn: (m: any) => warn.push(String(m)),
    lines: { info, warn },
  }
}

const makeAuth = (
  db: Record<string, any[]>,
  secret?: string,
  options: { logger?: any } = {}
) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [
      pikkuActor({ secret, logger: options.logger ?? recordingLogger() }),
    ],
  })

const clearGateEnv = () => {
  delete process.env[DEV_ACTOR_SIGN_IN_ENV]
  delete process.env[ACTOR_SIGN_IN_OPT_IN_ENV]
}

const signInActor = (
  auth: ReturnType<typeof makeAuth>,
  body: Record<string, unknown>
) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/actor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('better-auth actor plugin', () => {
  beforeEach(() => {
    process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  test('auto-creates the actor user and mints a session cookie', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, ROOT)

    const res = await signInActor(auth, {
      email: 'Customer@Actors.local',
      name: 'Customer',
      secret: await credentialFor('customer@actors.local'),
    })

    assert.equal(res.status, 200)
    const setCookie = res.headers.getSetCookie().join('; ')
    assert.match(setCookie, /better-auth\.session_token=/)

    const body = await res.json()
    assert.equal(body.user.email, 'customer@actors.local')
    assert.equal(body.user.actor, true)

    const row = db.user!.find((u) => u.email === 'customer@actors.local')
    assert.equal(row?.actor, true, 'user row is flagged actor')
    assert.equal(db.user!.length, 1)

    // Second sign-in reuses the row
    const res2 = await signInActor(auth, {
      email: 'customer@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })
    assert.equal(res2.status, 200)
    assert.equal(db.user!.length, 1, 'no duplicate actor rows')
  })

  test('refuses to impersonate a real (non-actor) user even with the secret', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'u1',
          email: 'real@person.com',
          name: 'Real',
          emailVerified: true,
          actor: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [],
    }
    const auth = makeAuth(db, ROOT)

    const res = await signInActor(auth, {
      email: 'real@person.com',
      secret: await credentialFor('real@person.com'),
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /not an actor/)
  })

  // The whole point of deriving: a credential is a capability for one synthetic
  // account, so a leaked one is worth that account and not the population.
  test("one persona's credential does not open another persona", async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInActor(makeAuth(db, ROOT), {
      email: 'other@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /Invalid actor secret/)
    assert.equal(db.user!.length, 0, 'no user created for a foreign credential')
  })

  // The root derives every credential, so it must never be one itself —
  // otherwise handing it out is handing out all of them, which is what this
  // whole shape exists to stop.
  test('the root secret is not itself a credential', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInActor(makeAuth(db, ROOT), {
      email: 'customer@actors.local',
      secret: ROOT,
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /Invalid actor secret/)
  })

  // A password-strength root would make every derived credential guessable
  // from it, so the endpoint refuses rather than deriving from weak material.
  test('a root too short to be key material refuses the endpoint', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const logger = recordingLogger()
    const res = await signInActor(makeAuth(db, 'short', { logger }), {
      email: 'customer@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })
    assert.equal(res.status, 401)
    assert.match(
      (await res.json()).message ?? '',
      /not configured with a strong enough secret/
    )
    assert.match(logger.lines.warn.join('\n'), /shorter than 32 characters/)
  })

  test('rejects a wrong secret and an unconfigured plugin', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const wrong = await signInActor(makeAuth(db, ROOT), {
      email: 'a@b.c',
      secret: 'nope',
    })
    assert.equal(wrong.status, 401)
    assert.equal(db.user!.length, 0, 'no user created on bad secret')

    const unconfigured = await signInActor(makeAuth(db, undefined), {
      email: 'a@b.c',
      secret: '',
    })
    assert.equal(unconfigured.status, 401)
  })
})

describe('actor sign-in gate', () => {
  beforeEach(clearGateEnv)
  afterEach(clearGateEnv)

  test('refuses every sign-in when no command enabled it, secret or not', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInActor(makeAuth(db, ROOT), {
      email: 'customer@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })

    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /disabled outside/)
    assert.equal(db.user!.length, 0, 'a refused sign-in mints no actor row')
  })

  test('`pikku dev` setting its marker is what turns it on', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'

    const res = await signInActor(makeAuth(db, ROOT), {
      email: 'customer@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })
    assert.equal(res.status, 200)
  })

  test('the opt-in env var enables it outside dev, but only spelt exactly', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }

    process.env[ACTOR_SIGN_IN_OPT_IN_ENV] = 'true'
    const nearMiss = recordingLogger()
    const refused = await signInActor(
      makeAuth(db, ROOT, { logger: nearMiss }),
      {
        email: 'customer@actors.local',
        secret: await credentialFor('customer@actors.local'),
      }
    )
    assert.equal(refused.status, 401, "'true' is not the opt-in value")
    assert.match(
      nearMiss.lines.warn.join('\n'),
      new RegExp(ACTOR_SIGN_IN_OPT_IN_VALUE),
      'the near miss names the literal that would have worked'
    )
    assert.doesNotMatch(
      nearMiss.lines.warn.join('\n'),
      /'true'/,
      'and never the value it was given, which may be a pasted secret'
    )

    process.env[ACTOR_SIGN_IN_OPT_IN_ENV] = ACTOR_SIGN_IN_OPT_IN_VALUE
    const stillRefused = await signInActor(makeAuth(db, ROOT), {
      email: 'customer@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })
    assert.equal(
      stillRefused.status,
      401,
      'the opt-in reaches the secret check; provisioning is a separate power'
    )
    assert.match((await stillRefused.json()).message ?? '', /No actor account/)
  })

  test('the opt-in signs provisioned actors in but mints no new ones', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    process.env[ACTOR_SIGN_IN_OPT_IN_ENV] = ACTOR_SIGN_IN_OPT_IN_VALUE

    const unknown = await signInActor(makeAuth(db, ROOT), {
      email: 'never-provisioned@actors.local',
      secret: await credentialFor('never-provisioned@actors.local'),
    })
    assert.equal(unknown.status, 401)
    assert.match((await unknown.json()).message ?? '', /No actor account/)
    assert.equal(db.user!.length, 0)

    db.user!.push({
      id: 'provisioned-1',
      email: 'customer@actors.local',
      name: 'customer',
      actor: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const provisioned = await signInActor(makeAuth(db, ROOT), {
      email: 'customer@actors.local',
      secret: await credentialFor('customer@actors.local'),
    })
    assert.equal(provisioned.status, 200)
  })

  test('a secret configured on a shut gate is a warning, not a silent no-op', () => {
    const logger = recordingLogger()
    pikkuActor({ secret: ROOT, logger })
    assert.match(
      logger.lines.warn.join('\n'),
      /secret is configured but sign-in stays disabled/
    )

    const quiet = recordingLogger()
    pikkuActor({ secret: undefined, logger: quiet })
    assert.deepEqual(
      quiet.lines.warn,
      [],
      'no secret and no opt-in is the intended production state'
    )
  })

  test('announces itself when it is open', () => {
    process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'
    const logger = recordingLogger()
    pikkuActor({ secret: ROOT, logger })
    assert.match(
      logger.lines.info.join('\n'),
      new RegExp(DEV_ACTOR_SIGN_IN_ENV)
    )
  })

  test('still declares the actor column while disabled', () => {
    const logger = recordingLogger()
    const plugin = pikkuActor({ secret: undefined, logger })
    assert.equal((plugin.schema as any).user.fields.actor.type, 'boolean')
  })
})

describe('stampActorFlag', () => {
  test('stamps actor users, leaves real users and explicit values alone', () => {
    assert.deepEqual(stampActorFlag({ userId: 'u1' }, { actor: true }), {
      userId: 'u1',
      actor: true,
    })
    assert.deepEqual(stampActorFlag({ userId: 'u1' }, { actor: false }), {
      userId: 'u1',
    })
    assert.deepEqual(stampActorFlag({ userId: 'u1' }, undefined), {
      userId: 'u1',
    })
    // A mapSession that explicitly set actor wins
    assert.deepEqual(
      stampActorFlag({ userId: 'u1', actor: false }, { actor: true }),
      { userId: 'u1', actor: false }
    )
  })
})
