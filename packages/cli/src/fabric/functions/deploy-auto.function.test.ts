import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'
import * as stageLib from '../lib/stage.js'
import { FabricPreconditionError } from '../lib/errors.js'

/**
 * The command against a faked fabric: showing the flag may be a plain read of
 * `listStages`, but setting it goes through `resolveStage` and
 * `setStageAutoDeploy`, so the stageId the server is handed is the whole of
 * what the branch argument turns into.
 */
const realConfig = { ...configLib }
const realHttp = { ...httpLib }
const realStage = { ...stageLib }
let override = true

let context: { token: string | null; projectId: string | null }
let responses: Record<string, unknown>
const invoked: { name: string; data: unknown }[] = []

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
            return responses[name]
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

after(() => {
  override = false
})

const { FabricDeployAuto, renderDeployAuto } =
  await import('./deploy-auto.function.js')

const run = (data: Record<string, unknown>) =>
  FabricDeployAuto.func({} as any, data as any, {} as any)

const printed = (result: unknown): string => {
  const lines: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => lines.push(args.join(' '))
  try {
    renderDeployAuto(null, result as any)
  } finally {
    console.log = log
  }
  return lines.join('\n')
}

describe('fabric deploy auto', () => {
  beforeEach(() => {
    context = { token: 'user-token', projectId: 'proj_1' }
    invoked.length = 0
    responses = {
      listStages: {
        stages: [
          { branch: 'main', autoDeployOnPush: true },
          { branch: 'preview', autoDeployOnPush: false },
        ],
      },
    }
  })

  test('shows every stage and its flag', async () => {
    const result = await run({})
    assert.deepStrictEqual(result, {
      stages: [
        { branch: 'main', autoDeployOnPush: true },
        { branch: 'preview', autoDeployOnPush: false },
      ],
    })
  })

  test('narrows the read to the requested branch', async () => {
    const result = await run({ branch: 'preview' })
    assert.deepStrictEqual(result, {
      stages: [{ branch: 'preview', autoDeployOnPush: false }],
    })
  })

  test('an unknown branch names it and the ones that exist', async () => {
    await assert.rejects(
      () => run({ branch: 'nope' }),
      (error: Error) => {
        assert.ok(error instanceof FabricPreconditionError)
        assert.match(error.message, /No stage for branch "nope"/)
        assert.match(error.message, /Existing: main, preview/)
        return true
      }
    )
  })

  test('an unknown branch with no stages does not list an empty "Existing"', async () => {
    responses.listStages = { stages: [] }
    await assert.rejects(
      () => run({ branch: 'nope' }),
      (error: Error) => {
        assert.match(error.message, /No stage for branch "nope"/)
        assert.doesNotMatch(error.message, /Existing:/)
        return true
      }
    )
  })

  test('turns it on through the resolved stage', async () => {
    responses.setStageAutoDeploy = {
      autoDeployOnPush: true,
      protected: true,
    }
    const result = await run({ state: 'on', branch: 'main' })

    assert.deepStrictEqual(invoked, [
      {
        name: 'setStageAutoDeploy',
        data: { stageId: 'stage_1', autoDeployOnPush: true },
      },
    ])
    assert.deepStrictEqual(result, {
      stages: [{ branch: 'main', autoDeployOnPush: true }],
      protected: true,
    })
  })

  test('a protected stage is reported rather than hidden', async () => {
    responses.setStageAutoDeploy = {
      autoDeployOnPush: true,
      protected: true,
    }
    const result = await run({ state: 'on', branch: 'main' })
    assert.strictEqual((result as { protected: boolean }).protected, true)
  })

  test('turns it off and hands the stage the false', async () => {
    responses.setStageAutoDeploy = {
      autoDeployOnPush: false,
      protected: false,
    }
    await run({ state: 'off', branch: 'main' })
    assert.deepStrictEqual(invoked, [
      {
        name: 'setStageAutoDeploy',
        data: { stageId: 'stage_1', autoDeployOnPush: false },
      },
    ])
  })

  test('refuses without a login, before touching fabric', async () => {
    context.token = null
    await assert.rejects(() => run({ state: 'on' }), /pikku fabric login/)
    assert.strictEqual(invoked.length, 0)
  })

  test('refuses without a linked project', async () => {
    context.projectId = null
    await assert.rejects(() => run({ state: 'on' }), /pikku fabric link/)
  })
})

describe('renderDeployAuto', () => {
  test('says when there is nothing deployed yet', () => {
    assert.match(
      printed({ stages: [] }),
      /No stages deployed for this project yet/
    )
  })

  test('marks which branches are on and which are off', () => {
    const out = printed({
      stages: [
        { branch: 'main', autoDeployOnPush: true },
        { branch: 'preview', autoDeployOnPush: false },
      ],
    })
    assert.match(out, /main on/)
    assert.match(out, /preview off/)
  })

  test('explains that a protected stage can still stop for approval', () => {
    const out = printed({
      stages: [{ branch: 'main', autoDeployOnPush: true }],
      protected: true,
    })
    assert.match(out, /will still wait for approval/)
  })

  test('skips the approval note when the stage is not protected', () => {
    const out = printed({
      stages: [{ branch: 'main', autoDeployOnPush: true }],
      protected: false,
    })
    assert.doesNotMatch(out, /wait for approval/)
  })
})
