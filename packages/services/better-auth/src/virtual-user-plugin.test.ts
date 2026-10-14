import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { deriveVirtualUserSecret } from '@pikku/core/services'

import {
  virtualUserCredentialEnvKey,
  parseVirtualUserCredential,
  pikkuVirtualUser,
} from './virtual-user-plugin.js'
import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
} from './virtual-user-sign-in-gate.js'
import { stampVirtualUserFlag } from './stamp-virtual-user-flag.js'

/**
 * A root long enough to be key material — every virtual user's credential is derived
 * from it, so the plugin refuses anything shorter than 32 characters.
 */
const ROOT = 'flow-secret-flow-secret-flow-secret'

/** What a caller actually presents: the credential for that one address. */
const credentialFor = (email: string) => deriveVirtualUserSecret(ROOT, email)

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
  options: {
    logger?: any
    allowSignIn?: string
    virtualUserSignIn?: Parameters<
      typeof pikkuVirtualUser
    >[0]['virtualUserSignIn']
  } = {}
) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [
      pikkuVirtualUser({
        secret,
        allowSignIn: options.allowSignIn,
        virtualUserSignIn: options.virtualUserSignIn,
        logger: options.logger ?? recordingLogger(),
      }),
    ],
  })

const clearGateEnv = () => {
  delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
  delete process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV]
}

const signInWithEmail = (
  auth: ReturnType<typeof makeAuth>,
  body: Record<string, unknown>
) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/virtual-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

describe('better-auth virtual user plugin', () => {
  beforeEach(() => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  test('auto-creates the virtual user user and mints a session cookie', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, ROOT)

    const res = await signInWithEmail(auth, {
      email: 'Customer@VirtualUser.local',
      name: 'Customer',
      secret: await credentialFor('customer@virtualuser.local'),
    })

    assert.equal(res.status, 200)
    const setCookie = res.headers.getSetCookie().join('; ')
    assert.match(setCookie, /better-auth\.session_token=/)

    const body = await res.json()
    assert.equal(body.user.email, 'customer@virtualuser.local')
    assert.equal(body.user.virtualUser, true)

    const row = db.user!.find((u) => u.email === 'customer@virtualuser.local')
    assert.equal(row?.virtualUser, true, 'user row is flagged virtual user')
    assert.equal(db.user!.length, 1)

    // Second sign-in reuses the row
    const res2 = await signInWithEmail(auth, {
      email: 'customer@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
    })
    assert.equal(res2.status, 200)
    assert.equal(db.user!.length, 1, 'no duplicate virtual user rows')
  })

  test('refuses to impersonate a real (non-virtual-user) user even with the secret', async () => {
    const db: Record<string, any[]> = {
      user: [
        {
          id: 'u1',
          email: 'real@person.com',
          name: 'Real',
          emailVerified: true,
          virtualUser: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: [],
    }
    const auth = makeAuth(db, ROOT)

    const res = await signInWithEmail(auth, {
      email: 'real@person.com',
      secret: await credentialFor('real@person.com'),
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /not a virtual user/)
  })

  // The whole point of deriving: a credential is a capability for one synthetic
  // account, so a leaked one is worth that account and not the population.
  test("one virtual user's credential does not open another virtual user", async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'other@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
    })
    assert.equal(res.status, 401)
    assert.match(
      (await res.json()).message ?? '',
      /Invalid virtual user secret/
    )
    assert.equal(db.user!.length, 0, 'no user created for a foreign credential')
  })

  // The root derives every credential, so it must never be one itself —
  // otherwise handing it out is handing out all of them, which is what this
  // whole shape exists to stop.
  test('the root secret is not itself a credential', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'customer@virtualuser.local',
      secret: ROOT,
    })
    assert.equal(res.status, 401)
    assert.match(
      (await res.json()).message ?? '',
      /Invalid virtual user secret/
    )
  })

  // A password-strength root would make every derived credential guessable
  // from it, so the endpoint refuses rather than deriving from weak material.
  test('a root too short to be key material refuses the endpoint', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const logger = recordingLogger()
    const res = await signInWithEmail(makeAuth(db, 'short', { logger }), {
      email: 'customer@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
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
    const wrong = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'a@b.c',
      secret: 'nope',
    })
    assert.equal(wrong.status, 401)
    assert.equal(db.user!.length, 0, 'no user created on bad secret')

    const unconfigured = await signInWithEmail(makeAuth(db, undefined), {
      email: 'a@b.c',
      secret: '',
    })
    assert.equal(unconfigured.status, 401)
  })
})

const signInVirtualUser = (auth: ReturnType<typeof makeAuth>, id: string) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/switch-virtual-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  )

const listVirtualUsers = (auth: ReturnType<typeof makeAuth>, app?: string) =>
  auth.handler(
    new Request(
      `http://localhost:3000/api/auth/sign-in/virtual-users${app ? `?app=${app}` : ''}`
    )
  )

describe('virtual user sign-in', () => {
  const virtualUsers = [
    {
      id: 'customer',
      email: 'customer@virtualuser.local',
      name: 'Customer',
      app: 'web',
    },
    {
      id: 'admin',
      email: 'admin@virtualuser.local',
      name: 'Admin',
      app: 'admin',
    },
    { id: 'banned', email: 'banned@virtualuser.local', runnable: false },
  ]

  test('lists only the virtual users it will sign in, narrowed to the app', async () => {
    const auth = makeAuth({ user: [], session: [], account: [] }, ROOT, {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    assert.deepEqual(
      (await (await listVirtualUsers(auth)).json()).virtualUsers,
      [
        { id: 'customer', name: 'Customer', jobTitle: null },
        { id: 'admin', name: 'Admin', jobTitle: null },
      ]
    )
    assert.deepEqual(
      (await (await listVirtualUsers(auth, 'admin')).json()).virtualUsers.map(
        (virtualUser: { id: string }) => virtualUser.id
      ),
      ['admin']
    )
  })

  test('without `allowed`, a deployed stage follows its devSwitcher flag', async () => {
    clearGateEnv()
    let enabled = false
    const auth = makeAuth({ user: [], session: [], account: [] }, ROOT, {
      allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
      virtualUserSignIn: {
        virtualUsers,
        featureFlags: {
          snapshot: async () => ({
            devSwitcher: { enabled, rolloutPercent: null, overrides: {} },
          }),
        },
      },
    })

    assert.deepEqual(
      (await (await listVirtualUsers(auth)).json()).virtualUsers,
      []
    )
    assert.equal((await signInVirtualUser(auth, 'customer')).status, 401)
    enabled = true
    assert.equal(
      (await (await listVirtualUsers(auth)).json()).virtualUsers.length,
      2
    )
  })

  test('without `allowed` or flags, `pikku dev` is open', async () => {
    const auth = makeAuth({ user: [], session: [], account: [] }, ROOT, {
      virtualUserSignIn: { virtualUsers },
    })
    assert.equal(
      (await (await listVirtualUsers(auth)).json()).virtualUsers.length,
      2
    )
  })

  test('lists nobody when `allowed` refuses', async () => {
    const auth = makeAuth({ user: [], session: [], account: [] }, ROOT, {
      virtualUserSignIn: { virtualUsers, allowed: () => false },
    })
    const res = await listVirtualUsers(auth)
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).virtualUsers, [])
  })

  beforeEach(() => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  test('signs in as a declared virtual user with no credential from the caller', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, ROOT, {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    const res = await signInVirtualUser(auth, 'customer')

    assert.equal(res.status, 200)
    assert.match(
      res.headers.getSetCookie().join('; '),
      /better-auth\.session_token=/
    )
    assert.equal((await res.json()).user.email, 'customer@virtualuser.local')
  })

  test('asks `allowed` on every call', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    let allowed = false
    const auth = makeAuth(db, ROOT, {
      virtualUserSignIn: { virtualUsers, allowed: async () => allowed },
    })

    assert.equal((await signInVirtualUser(auth, 'customer')).status, 401)
    allowed = true
    assert.equal((await signInVirtualUser(auth, 'customer')).status, 200)
  })

  test('stays shut when the virtual user gate is shut, whatever `allowed` says', async () => {
    clearGateEnv()
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, ROOT, {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    assert.equal((await signInVirtualUser(auth, 'customer')).status, 401)
    assert.equal(db.user!.length, 0)
  })

  test('refuses an undeclared or non-runnable virtual user', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = makeAuth(db, ROOT, {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    assert.equal((await signInVirtualUser(auth, 'nobody')).status, 404)
    assert.equal((await signInVirtualUser(auth, 'banned')).status, 404)
  })

  test('is not served unless configured', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInVirtualUser(makeAuth(db, ROOT), 'customer')
    assert.equal(res.status, 404)
    assert.equal(db.user!.length, 0)
  })
})

describe('virtual user sign-in gate', () => {
  beforeEach(clearGateEnv)
  afterEach(clearGateEnv)

  test('refuses every sign-in when no command enabled it, secret or not', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const res = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'customer@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
    })

    assert.equal(res.status, 401)
    assert.match((await res.json()).message ?? '', /disabled outside/)
    assert.equal(
      db.user!.length,
      0,
      'a refused sign-in mints no virtual user row'
    )
  })

  test('`pikku dev` setting its marker is what turns it on', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'

    const res = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'customer@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
    })
    assert.equal(res.status, 200)
  })

  test('the opt-in env var enables it outside dev, but only spelt exactly', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }

    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] = 'true'
    const nearMiss = recordingLogger()
    const refused = await signInWithEmail(
      makeAuth(db, ROOT, { logger: nearMiss }),
      {
        email: 'customer@virtualuser.local',
        secret: await credentialFor('customer@virtualuser.local'),
      }
    )
    assert.equal(refused.status, 401, "'true' is not the opt-in value")
    assert.match(
      nearMiss.lines.warn.join('\n'),
      new RegExp(VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE),
      'the near miss names the literal that would have worked'
    )
    assert.doesNotMatch(
      nearMiss.lines.warn.join('\n'),
      /'true'/,
      'and never the value it was given, which may be a pasted secret'
    )

    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] =
      VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE
    const stillRefused = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'customer@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
    })
    assert.equal(
      stillRefused.status,
      401,
      'the opt-in reaches the secret check; provisioning is a separate power'
    )
    assert.match(
      (await stillRefused.json()).message ?? '',
      /No virtual user account/
    )
  })

  test('the opt-in signs provisioned virtual users in but mints no new ones', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] =
      VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE

    const unknown = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'never-provisioned@virtualuser.local',
      secret: await credentialFor('never-provisioned@virtualuser.local'),
    })
    assert.equal(unknown.status, 401)
    assert.match(
      (await unknown.json()).message ?? '',
      /No virtual user account/
    )
    assert.equal(db.user!.length, 0)

    db.user!.push({
      id: 'provisioned-1',
      email: 'customer@virtualuser.local',
      name: 'customer',
      virtualUser: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const provisioned = await signInWithEmail(makeAuth(db, ROOT), {
      email: 'customer@virtualuser.local',
      secret: await credentialFor('customer@virtualuser.local'),
    })
    assert.equal(provisioned.status, 200)
  })

  test('a secret configured on a shut gate is a warning, not a silent no-op', () => {
    const logger = recordingLogger()
    pikkuVirtualUser({ secret: ROOT, logger })
    assert.match(
      logger.lines.warn.join('\n'),
      /secret is configured but sign-in stays disabled/
    )

    const quiet = recordingLogger()
    pikkuVirtualUser({ secret: undefined, logger: quiet })
    assert.deepEqual(
      quiet.lines.warn,
      [],
      'no secret and no opt-in is the intended production state'
    )
  })

  test('announces itself when it is open', () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    const logger = recordingLogger()
    pikkuVirtualUser({ secret: ROOT, logger })
    assert.match(
      logger.lines.info.join('\n'),
      new RegExp(DEV_VIRTUAL_USER_SIGN_IN_ENV)
    )
  })

  test('a caller that holds the opt-in itself opens the gate', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    db.user!.push({
      id: 'provisioned-1',
      email: 'customer@virtualuser.local',
      name: 'customer',
      virtualUser: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    assert.equal(
      process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV],
      undefined,
      'the environment is empty — this is the Worker case, where the opt-in arrives as a binding'
    )
    const res = await signInWithEmail(
      makeAuth(db, ROOT, { allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE }),
      {
        email: 'customer@virtualuser.local',
        secret: await credentialFor('customer@virtualuser.local'),
      }
    )
    assert.equal(res.status, 200)
  })

  test('a passed opt-in is spelt exactly, and is not rescued by the environment', async () => {
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] =
      VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE

    const nearMiss = recordingLogger()
    const refused = await signInWithEmail(
      makeAuth(db, ROOT, { allowSignIn: 'true', logger: nearMiss }),
      {
        email: 'customer@virtualuser.local',
        secret: await credentialFor('customer@virtualuser.local'),
      }
    )
    assert.equal(
      refused.status,
      401,
      'the caller said where to read the opt-in from, so the environment is not consulted'
    )
    assert.match(
      nearMiss.lines.warn.join('\n'),
      new RegExp(VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE)
    )
    assert.doesNotMatch(nearMiss.lines.warn.join('\n'), /'true'/)
  })

  test('still declares the virtual user column while disabled', () => {
    const logger = recordingLogger()
    const plugin = pikkuVirtualUser({ secret: undefined, logger })
    assert.equal((plugin.schema as any).user.fields.virtualUser.type, 'boolean')
  })
})

describe('stampVirtualUserFlag', () => {
  test('stamps virtual user users, leaves real users and explicit values alone', () => {
    assert.deepEqual(
      stampVirtualUserFlag({ userId: 'u1' }, { virtualUser: true }),
      {
        userId: 'u1',
        virtualUser: true,
      }
    )
    assert.deepEqual(
      stampVirtualUserFlag({ userId: 'u1' }, { virtualUser: false }),
      {
        userId: 'u1',
      }
    )
    assert.deepEqual(stampVirtualUserFlag({ userId: 'u1' }, undefined), {
      userId: 'u1',
    })
    // A mapSession that explicitly set virtual user wins
    assert.deepEqual(
      stampVirtualUserFlag(
        { userId: 'u1', virtualUser: false },
        { virtualUser: true }
      ),
      { userId: 'u1', virtualUser: false }
    )
  })
})

describe('virtual user upstream credentials', () => {
  beforeEach(() => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  const signInWith = async (env: Record<string, string>) => {
    const stored: Array<[string, unknown, string]> = []
    const removed: string[] = []
    const db: Record<string, any[]> = { user: [], session: [], account: [] }
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'better-auth-test-secret',
      database: memoryAdapter(db),
      emailAndPassword: { enabled: true },
      plugins: [
        pikkuVirtualUser({
          secret: ROOT,
          logger: recordingLogger(),
          credentials: {
            names: ['dolibarr', 'calendar'],
            store: async (name, value, userId) => {
              stored.push([name, value, userId])
            },
            remove: async (name) => {
              removed.push(name)
            },
            read: (key) => env[key],
          },
        }),
      ],
    })
    const email = 'dan@virtualuser.local'
    const res = await signInWithEmail(auth, {
      email,
      secret: await credentialFor(email),
    })
    return { res, stored, removed, db }
  }

  test('derives the env key from the virtual user id and credential name', () => {
    assert.equal(
      virtualUserCredentialEnvKey('dan@virtualuser.local', 'dolibarr'),
      'VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR'
    )
    assert.equal(
      virtualUserCredentialEnvKey('ops-lead@virtualuser.local', 'googleBooks'),
      'VIRTUAL_USER_CREDENTIAL_OPS_LEAD_GOOGLEBOOKS'
    )
  })

  test('a bare value is a token, a JSON object is stored as-is', () => {
    assert.deepEqual(parseVirtualUserCredential(' abc '), { token: 'abc' })
    assert.deepEqual(parseVirtualUserCredential('{"apiKey":"k"}'), {
      apiKey: 'k',
    })
    assert.throws(() => parseVirtualUserCredential('{nope'))
  })

  test('stores each configured credential for the signed-in virtual user', async () => {
    const { res, stored, db } = await signInWith({
      VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR: 'tok-123',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(stored, [
      ['dolibarr', { token: 'tok-123' }, db.user[0].id],
    ])
  })

  test('stores nothing when no value is set, and removes what an earlier sign-in stored', async () => {
    const { res, stored, removed } = await signInWith({
      VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR: 'tok-123',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(
      stored.map(([name]) => name),
      ['dolibarr']
    )
    assert.deepEqual(removed, ['calendar'])
  })

  test('refuses sign-in on a malformed JSON value', async () => {
    const { res, stored } = await signInWith({
      VIRTUAL_USER_CREDENTIAL_DAN_CALENDAR: '{broken',
    })
    assert.equal(res.status, 500)
    assert.match(await res.text(), /VIRTUAL_USER_CREDENTIAL_DAN_CALENDAR/)
    assert.deepEqual(stored, [])
  })
})
