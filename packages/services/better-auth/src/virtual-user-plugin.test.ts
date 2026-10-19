import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { SignJWT, exportSPKI, generateKeyPair } from 'jose'

import { JoseVirtualUserStatementVerifier } from '@pikku/jose'
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

const recordingLogger = () => {
  const info: string[] = []
  const warn: string[] = []
  return {
    info: (m: unknown, ..._meta: unknown[]) => {
      info.push(String(m))
    },
    warn: (m: unknown, ..._meta: unknown[]) => {
      warn.push(String(m))
    },
    lines: { info, warn },
  }
}

const ORIGIN = 'http://localhost:3000'

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

type PluginOptions = Parameters<typeof pikkuVirtualUser>[0]

const makeAuth = (
  db: Record<string, any[]>,
  options: PluginOptions & { logger?: any } = {}
) =>
  betterAuth({
    baseURL: ORIGIN,
    secret: 'better-auth-test-secret',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [
      pikkuVirtualUser({
        ...options,
        logger: options.logger ?? recordingLogger(),
      }),
    ],
  })

const emptyDb = (): Record<string, any[]> => ({
  user: [],
  session: [],
  account: [],
})

const clearGateEnv = () => {
  delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
  delete process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV]
}

const keyPair = async () => {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
    extractable: true,
  })
  const publicPem = await exportSPKI(publicKey)
  return {
    privateKey,
    publicKey: publicPem,
    verifier: new JoseVirtualUserStatementVerifier(publicPem),
  }
}

const statementFor = (
  privateKey: CryptoKey,
  id: string,
  audience = ORIGIN,
  jti: string = crypto.randomUUID()
) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(id)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('3m')
    .setJti(jti)
    .sign(privateKey)

const post = (
  auth: ReturnType<typeof makeAuth>,
  path: string,
  body: Record<string, unknown>
) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const signInInProcess = (
  auth: ReturnType<typeof makeAuth>,
  body: { email: string; name?: string }
) => (auth.api as any).signInVirtualUserInternal({ body, asResponse: true })

describe('in-process sign-in (runs)', () => {
  beforeEach(() => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  test('auth.api creates the virtual user and returns a session cookie', async () => {
    const db = emptyDb()
    const auth = makeAuth(db)

    const res: Response = await signInInProcess(auth, {
      email: 'Customer@VirtualUser.local',
      name: 'Customer',
    })

    assert.equal(res.status, 200)
    assert.match(
      res.headers.getSetCookie().join('; '),
      /better-auth\.session_token=/
    )
    const body = await res.json()
    assert.equal(body.user.email, 'customer@virtualuser.local')
    assert.equal(body.user.virtualUser, true)
    assert.equal(
      db.user!.find((u) => u.email === 'customer@virtualuser.local')
        ?.virtualUser,
      true
    )

    await signInInProcess(auth, { email: 'customer@virtualuser.local' })
    assert.equal(db.user!.length, 1, 'no duplicate virtual user rows')
  })

  test('is not routable over HTTP: auth.handler 404s the path', async () => {
    const db = emptyDb()
    const auth = makeAuth(db)

    const res = await post(auth, '/sign-in/virtual-user-internal', {
      email: 'customer@virtualuser.local',
    })

    assert.equal(res.status, 404)
    assert.equal(db.user!.length, 0)
  })

  test('refuses a real (non-virtual-user) user', async () => {
    const db = emptyDb()
    db.user!.push({
      id: 'u1',
      email: 'real@person.com',
      name: 'Real',
      emailVerified: true,
      virtualUser: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const auth = makeAuth(db)

    const res: Response = await signInInProcess(auth, {
      email: 'real@person.com',
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message, /not a virtual user/)
  })

  test('on a stage it signs in provisioned virtual users and mints no new ones', async () => {
    clearGateEnv()
    const db = emptyDb()
    const auth = makeAuth(db, {
      allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
    })

    const unknown: Response = await signInInProcess(auth, {
      email: 'never@virtualuser.local',
    })
    assert.equal(unknown.status, 401)
    assert.match((await unknown.json()).message, /No virtual user account/)
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
    const res: Response = await signInInProcess(auth, {
      email: 'customer@virtualuser.local',
    })
    assert.equal(res.status, 200)
  })
})

describe('signed statement sign-in (external callers)', () => {
  beforeEach(() => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  const setup = async (extra: PluginOptions = {}) => {
    const db = emptyDb()
    const { privateKey, verifier } = await keyPair()
    const auth = makeAuth(db, {
      statementVerifier: verifier,
      virtualUserSignIn: { virtualUsers },
      ...extra,
    })
    return { db, auth, privateKey }
  }

  test('signs the declared virtual user in and sets the cookie', async () => {
    const { db, auth, privateKey } = await setup()

    const res = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer'),
    })

    assert.equal(res.status, 200)
    assert.match(
      res.headers.getSetCookie().join('; '),
      /better-auth\.session_token=/
    )
    assert.equal((await res.json()).user.email, 'customer@virtualuser.local')
    assert.equal(db.user!.length, 1)
  })

  test('rejects a replayed statement', async () => {
    const { auth, privateKey } = await setup()
    const statement = await statementFor(privateKey, 'customer')

    assert.equal(
      (await post(auth, '/sign-in/virtual-user', { statement })).status,
      200
    )
    const again = await post(auth, '/sign-in/virtual-user', { statement })
    assert.equal(again.status, 401)
    assert.match((await again.json()).message, /already used/)
  })

  test('rejects another audience, another key and garbage', async () => {
    const { db, auth, privateKey } = await setup()
    const other = await keyPair()

    for (const statement of [
      await statementFor(privateKey, 'customer', 'https://elsewhere.example'),
      await statementFor(other.privateKey, 'customer'),
      'not-a-jwt',
    ]) {
      const res = await post(auth, '/sign-in/virtual-user', { statement })
      assert.equal(res.status, 401)
    }
    assert.equal(db.user!.length, 0, 'nothing is created for a bad statement')
  })

  test('the audience option overrides the base URL origin', async () => {
    const { auth, privateKey } = await setup({ audience: 'my-app' })
    const res = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer', 'my-app'),
    })
    assert.equal(res.status, 200)
  })

  test('refuses an undeclared or non-runnable virtual user', async () => {
    const { auth, privateKey } = await setup()
    for (const id of ['nobody', 'banned']) {
      const res = await post(auth, '/sign-in/virtual-user', {
        statement: await statementFor(privateKey, id),
      })
      assert.equal(res.status, 404)
    }
  })

  test('refuses a real user whose address a virtual user declaration names', async () => {
    const db = emptyDb()
    db.user!.push({
      id: 'u1',
      email: 'customer@virtualuser.local',
      name: 'Real',
      emailVerified: true,
      virtualUser: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const { privateKey, verifier } = await keyPair()
    const auth = makeAuth(db, {
      statementVerifier: verifier,
      virtualUserSignIn: { virtualUsers },
    })
    const res = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer'),
    })
    assert.equal(res.status, 401)
    assert.match((await res.json()).message, /not a virtual user/)
  })

  test('is not served without a verifier', async () => {
    const auth = makeAuth(emptyDb(), { virtualUserSignIn: { virtualUsers } })
    const res = await post(auth, '/sign-in/virtual-user', { statement: 'x' })
    assert.equal(res.status, 404)
  })

  test('the opt-in lets a stage sign provisioned virtual users in, and no others', async () => {
    clearGateEnv()
    const { db, auth, privateKey } = await setup({
      allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
    })

    const unknown = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer'),
    })
    assert.equal(unknown.status, 401)
    assert.match((await unknown.json()).message, /No virtual user account/)
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
    const ok = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer'),
    })
    assert.equal(ok.status, 200)
  })
})

describe('a stage without a verify key', () => {
  beforeEach(() => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  })
  afterEach(clearGateEnv)

  test('says which variable to set and registers no statement endpoint', async () => {
    const logger = recordingLogger()
    const options = {
      logger,
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    }
    assert.ok(
      !Object.keys(pikkuVirtualUser(options).endpoints ?? {}).includes(
        'signInWithStatement'
      )
    )
    assert.ok(
      logger.lines.warn.some((line) => /VIRTUAL_USER_VERIFY_KEY/.test(line))
    )
  })

  test('builds the verifier from a verifyKey, so an app needs no @pikku/jose of its own', async () => {
    const { privateKey, publicKey } = await keyPair()
    const db = emptyDb()
    const auth = makeAuth(db, {
      verifyKey: publicKey,
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })
    const res = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer'),
    })
    assert.equal(res.status, 200)
  })

  test('stays quiet when the key is there', async () => {
    const logger = recordingLogger()
    const { verifier } = await keyPair()
    pikkuVirtualUser({
      logger,
      statementVerifier: verifier,
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })
    assert.deepEqual(logger.lines.warn, [])
  })
})

describe('production registers no sign-in endpoint', () => {
  beforeEach(clearGateEnv)
  afterEach(clearGateEnv)

  test('with the gate shut, neither the in-process nor the statement endpoint exists', async () => {
    const db = emptyDb()
    const { privateKey, verifier } = await keyPair()
    const options = {
      statementVerifier: verifier,
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    }
    const plugin = pikkuVirtualUser(options)
    const keys = Object.keys(plugin.endpoints ?? {})
    assert.ok(!keys.includes('signInVirtualUserInternal'))
    assert.ok(!keys.includes('signInWithStatement'))

    const auth = makeAuth(db, options)
    assert.equal((auth.api as any).signInVirtualUserInternal, undefined)
    assert.equal((auth.api as any).signInWithStatement, undefined)
    const res = await post(auth, '/sign-in/virtual-user', {
      statement: await statementFor(privateKey, 'customer'),
    })
    assert.equal(res.status, 404)
    assert.equal(db.user!.length, 0)
  })

  test('opening the gate after boot does not register what boot left out', async () => {
    const auth = makeAuth(emptyDb(), {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    assert.equal((auth.api as any).signInVirtualUserInternal, undefined)
  })

  test('says nothing when it is shut', () => {
    const logger = recordingLogger()
    pikkuVirtualUser({ logger })
    assert.deepEqual(logger.lines.warn, [])
    assert.deepEqual(logger.lines.info, [])
  })

  test('still declares the virtual user column while disabled', () => {
    const plugin = pikkuVirtualUser({ logger: recordingLogger() })
    assert.equal((plugin.schema as any).user.fields.virtualUser.type, 'boolean')
  })
})

describe('virtual user gate', () => {
  beforeEach(clearGateEnv)
  afterEach(clearGateEnv)

  test('`pikku dev` setting its marker is what turns it on', async () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    const res: Response = await signInInProcess(makeAuth(emptyDb()), {
      email: 'customer@virtualuser.local',
    })
    assert.equal(res.status, 200)
  })

  test('the opt-in env var enables it outside dev, but only spelt exactly', () => {
    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] = 'true'
    const nearMiss = recordingLogger()
    const refused = makeAuth(emptyDb(), { logger: nearMiss })
    assert.equal((refused.api as any).signInVirtualUserInternal, undefined)
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
    const open = makeAuth(emptyDb())
    assert.equal(typeof (open.api as any).signInVirtualUserInternal, 'function')
  })

  test('announces itself when it is open', () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    const logger = recordingLogger()
    pikkuVirtualUser({ logger })
    assert.match(
      logger.lines.info.join('\n'),
      new RegExp(DEV_VIRTUAL_USER_SIGN_IN_ENV)
    )
  })

  test('a caller that holds the opt-in itself opens the gate', () => {
    assert.equal(
      process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV],
      undefined,
      'the environment is empty — this is the Worker case, where the opt-in arrives as a binding'
    )
    const auth = makeAuth(emptyDb(), {
      allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
    })
    assert.equal(typeof (auth.api as any).signInVirtualUserInternal, 'function')
  })

  test('a passed opt-in is spelt exactly, and is not rescued by the environment', () => {
    process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV] =
      VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE
    const nearMiss = recordingLogger()
    const auth = makeAuth(emptyDb(), { allowSignIn: 'true', logger: nearMiss })
    assert.equal((auth.api as any).signInVirtualUserInternal, undefined)
    assert.match(
      nearMiss.lines.warn.join('\n'),
      new RegExp(VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE)
    )
    assert.doesNotMatch(nearMiss.lines.warn.join('\n'), /'true'/)
  })
})

const signInVirtualUser = (
  auth: ReturnType<typeof makeAuth>,
  id: string,
  statement?: string
) => post(auth, '/sign-in/switch-virtual-user', { id, statement })

const listVirtualUsers = (auth: ReturnType<typeof makeAuth>, app?: string) =>
  auth.handler(
    new Request(
      `http://localhost:3000/api/auth/sign-in/virtual-users${app ? `?app=${app}` : ''}`
    )
  )

describe('virtual user sign-in', () => {
  test('lists only the virtual users it will sign in, narrowed to the app', async () => {
    const auth = makeAuth(emptyDb(), {
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
    const auth = makeAuth(emptyDb(), {
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
    const auth = makeAuth(emptyDb(), {
      virtualUserSignIn: { virtualUsers },
    })
    assert.equal(
      (await (await listVirtualUsers(auth)).json()).virtualUsers.length,
      2
    )
  })

  test('lists nobody when `allowed` refuses', async () => {
    const auth = makeAuth(emptyDb(), {
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
    const db = emptyDb()
    const auth = makeAuth(db, {
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

  test('under `pikku dev` sign-in grants the declared app scope and roles, once', async () => {
    const roles = new Map<string, string[]>()
    const scopes = new Map<string, string[]>()
    const scopeService = {
      listUserRoles: async (id: string) => roles.get(id) ?? [],
      listUserScopes: async (id: string) => scopes.get(id) ?? [],
      addUserToRole: async (id: string, role: string) => {
        roles.set(id, [...(roles.get(id) ?? []), role])
      },
      addScopeToUser: async (id: string, scope: string) => {
        scopes.set(id, [...(scopes.get(id) ?? []), scope])
      },
    }
    const db = emptyDb()
    const auth = makeAuth(db, {
      scopeService,
      virtualUserSignIn: {
        virtualUsers: [
          { ...virtualUsers[1]!, roles: ['studio'] },
          virtualUsers[0]!,
        ],
        allowed: () => true,
      },
    })

    assert.equal((await signInVirtualUser(auth, 'admin')).status, 200)
    assert.equal((await signInVirtualUser(auth, 'admin')).status, 200)
    const adminId = db.user!.find(
      (row) => row.email === 'admin@virtualuser.local'
    )!.id
    assert.deepEqual(roles.get(adminId), ['studio'])
    assert.deepEqual(scopes.get(adminId), ['app:admin'])
  })

  test('on a stage sign-in grants nothing, provisioning does', async () => {
    clearGateEnv()
    const granted: string[] = []
    const scopeService = {
      listUserRoles: async () => [],
      listUserScopes: async () => [],
      addUserToRole: async (_id: string, role: string) => {
        granted.push(role)
      },
      addScopeToUser: async (_id: string, scope: string) => {
        granted.push(scope)
      },
    }
    const db = emptyDb()
    db.user!.push({
      id: 'provisioned-1',
      email: 'admin@virtualuser.local',
      name: 'Admin',
      virtualUser: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const auth = makeAuth(db, {
      allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
      scopeService,
      virtualUserSignIn: {
        virtualUsers: [{ ...virtualUsers[1]!, roles: ['studio'] }],
        allowed: () => true,
      },
    })
    const res: Response = await signInInProcess(auth, {
      email: 'admin@virtualuser.local',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(granted, [])
  })

  test('asks `allowed` on every call', async () => {
    const db = emptyDb()
    let allowed = false
    const auth = makeAuth(db, {
      virtualUserSignIn: { virtualUsers, allowed: async () => allowed },
    })

    assert.equal((await signInVirtualUser(auth, 'customer')).status, 401)
    allowed = true
    assert.equal((await signInVirtualUser(auth, 'customer')).status, 200)
  })

  test('stays shut when the virtual user gate is shut, whatever `allowed` says', async () => {
    clearGateEnv()
    const db = emptyDb()
    const auth = makeAuth(db, {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    assert.equal((await signInVirtualUser(auth, 'customer')).status, 401)
    assert.equal(db.user!.length, 0)
  })

  test('refuses an undeclared or non-runnable virtual user', async () => {
    const db = emptyDb()
    const auth = makeAuth(db, {
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    assert.equal((await signInVirtualUser(auth, 'nobody')).status, 404)
    assert.equal((await signInVirtualUser(auth, 'banned')).status, 404)
  })

  test('on a stage, switching needs a signed statement for the same virtual user', async () => {
    clearGateEnv()
    const { privateKey, verifier } = await keyPair()
    const db = emptyDb()
    db.user!.push({
      id: 'u-customer',
      email: 'customer@virtualuser.local',
      name: 'Customer',
      virtualUser: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const auth = makeAuth(db, {
      allowSignIn: VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
      statementVerifier: verifier,
      virtualUserSignIn: { virtualUsers, allowed: () => true },
    })

    assert.equal(
      (await signInVirtualUser(auth, 'customer')).status,
      401,
      'no credential-free path on a stage'
    )
    assert.equal(
      (
        await signInVirtualUser(
          auth,
          'customer',
          await statementFor(privateKey, 'admin')
        )
      ).status,
      401,
      'a statement for someone else is not a statement for this id'
    )
    assert.equal(
      (
        await signInVirtualUser(
          auth,
          'customer',
          await statementFor(privateKey, 'customer')
        )
      ).status,
      200
    )
  })

  test('is not served unless configured', async () => {
    const db = emptyDb()
    const res = await signInVirtualUser(makeAuth(db), 'customer')
    assert.equal(res.status, 404)
    assert.equal(db.user!.length, 0)
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
    const res: Response = await signInInProcess(auth, {
      email: 'dan@virtualuser.local',
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
