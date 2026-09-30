import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'
import * as stageLib from '../lib/stage.js'
import { FabricPreconditionError } from '../lib/errors.js'

/**
 * The command itself, against a faked fabric and a faked stage: what reaches
 * the stage's `admin:createUser` is the whole of what the user ends up with,
 * so the URL, the bearer and the body are asserted at that boundary.
 *
 * `mock.module` outlives this file (see changes-commands.test.ts), so each
 * fake falls back to the real export once `override` is switched off.
 */
const realConfig = { ...configLib }
const realHttp = { ...httpLib }
const realStage = { ...stageLib }
let override = true

let context: { token: string | null; projectId: string | null }
const invoked: { name: string; data: any }[] = []

mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? { apiUrl: 'https://fabric.test', ...context }
      : realConfig.resolveApiContext(opts),
}))

mock.module('../lib/http.js', () => ({
  ...realHttp,
  getFabricRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string, data: unknown) => {
            invoked.push({ name, data })
            return {
              token: 'op-token',
              appUrl: 'https://stage.test',
              expiresAt: 0,
            }
          },
        }
      : realHttp.getFabricRPC(opts),
}))

mock.module('../lib/stage.js', () => ({
  ...realStage,
  resolveStage: async (rpc: any, projectId: string, requested?: string) =>
    override
      ? { stageId: 'stage_1', branch: requested ?? 'main' }
      : realStage.resolveStage(rpc, projectId, requested),
}))

const realFetch = globalThis.fetch
let requests: { url: string; init: RequestInit }[] = []
let stageResponse: Response

after(() => {
  override = false
  globalThis.fetch = realFetch
})

const { FabricUserAdd } = await import('./user-add.function.js')

const run = (data: Record<string, unknown>) =>
  FabricUserAdd.func({} as any, data as any, {} as any)

describe('fabric user add', () => {
  beforeEach(() => {
    context = { token: 'user-token', projectId: 'proj_1' }
    invoked.length = 0
    requests = []
    stageResponse = new Response(JSON.stringify({ userId: 'usr_1' }))
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return stageResponse
    }) as typeof fetch
  })

  test("calls the stage's own admin:createUser with an operator token", async () => {
    const result = await run({
      email: 'a@b.test',
      password: 'hunter2',
      name: 'Ada',
      branch: 'staging',
    })

    assert.deepStrictEqual(invoked, [
      { name: 'createStageOperatorToken', data: { stageId: 'stage_1' } },
    ])
    assert.strictEqual(requests.length, 1)
    const { url, init } = requests[0]!
    assert.strictEqual(url, 'https://stage.test/api/rpc/admin%3AcreateUser')
    assert.strictEqual(
      (init.headers as Record<string, string>).Authorization,
      'Bearer op-token'
    )
    assert.deepStrictEqual(JSON.parse(init.body as string), {
      rpcName: 'admin:createUser',
      data: { email: 'a@b.test', password: 'hunter2', name: 'Ada' },
    })
    assert.deepStrictEqual(result, {
      email: 'a@b.test',
      userId: 'usr_1',
      branch: 'staging',
    })
  })

  test('never echoes a password the operator chose', async () => {
    const result = await run({ email: 'a@b.test', password: 'hunter2' })
    assert.strictEqual('generatedPassword' in result, false)
  })

  test('refuses without a login, before touching the stage', async () => {
    context.token = null
    await assert.rejects(
      () => run({ email: 'a@b.test', password: 'x' }),
      (error: unknown) =>
        error instanceof FabricPreconditionError &&
        /pikku fabric login/.test(error.message)
    )
    assert.strictEqual(requests.length, 0)
  })

  test('refuses without a linked project', async () => {
    context.projectId = null
    await assert.rejects(
      () => run({ email: 'a@b.test', password: 'x' }),
      /pikku fabric link/
    )
  })

  test('names the missing addon when the stage has no admin:createUser', async () => {
    stageResponse = new Response('not found', { status: 404 })
    await assert.rejects(
      () => run({ email: 'a@b.test', password: 'x' }),
      /has not wired @pikku\/addon-admin.*Nothing was created/
    )
  })

  test('passes the stage refusal through verbatim', async () => {
    stageResponse = new Response('User already exists', { status: 409 })
    await assert.rejects(
      () => run({ email: 'a@b.test', password: 'x' }),
      /User already exists/
    )
  })

  test('refuses a success that carries no userId', async () => {
    stageResponse = new Response('{}')
    await assert.rejects(
      () => run({ email: 'a@b.test', password: 'x' }),
      /returned no userId/
    )
  })
})
