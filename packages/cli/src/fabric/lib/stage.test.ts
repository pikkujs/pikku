import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  autoDeployOffHints,
  matchStage,
  resolveStage,
  resolveStageId,
} from './stage.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

const rpcWith = (branches: string[]) =>
  ({
    invoke: async (name: string) => {
      assert.strictEqual(name, 'listStages')
      return {
        stages: branches.map((branch, i) => ({
          branch,
          stageId: `stage-${i + 1}`,
        })),
      }
    },
  }) as unknown as PikkuRPC

describe('resolveStageId', () => {
  test('resolves the named branch', async () => {
    const id = await resolveStageId(
      rpcWith(['main', 'preview']),
      'p1',
      'preview'
    )
    assert.strictEqual(id, 'stage-2')
  })

  /**
   * `--branch` is optional in practice and the schema does not stop it being
   * absent, so the helper used to interpolate `undefined` into its own error —
   * `No stage for branch "undefined". Existing: main` — while the line under it
   * named the single stage it could have used.
   */
  test('defaults to the only stage when the branch is omitted', async () => {
    const id = await resolveStageId(rpcWith(['main']), 'p1', undefined)
    assert.strictEqual(id, 'stage-1')
  })

  test('omitting the branch with several stages says the argument is required', async () => {
    await assert.rejects(
      () => resolveStageId(rpcWith(['main', 'preview']), 'p1', undefined),
      (error: Error) => {
        assert.match(error.message, /--branch is required/)
        assert.match(error.message, /main, preview/)
        assert.doesNotMatch(error.message, /undefined/)
        return true
      }
    )
  })

  test('omitting the branch with no stages says nothing is deployed', async () => {
    await assert.rejects(
      () => resolveStageId(rpcWith([]), 'p1', undefined),
      (error: Error) => {
        assert.doesNotMatch(error.message, /undefined/)
        return true
      }
    )
  })

  test('an unknown branch still names it, and the ones that exist', async () => {
    await assert.rejects(
      () => resolveStageId(rpcWith(['main']), 'p1', 'nope'),
      (error: Error) => {
        assert.match(error.message, /No stage for branch "nope"/)
        assert.match(error.message, /Existing: main/)
        return true
      }
    )
  })
  /**
   * The branch comes back with the id so a command can name the stage it acted
   * on. Echoing the argument instead prints `undefined` in exactly the case
   * the default exists to serve.
   */
  test('resolveStage names the stage it defaulted to', async () => {
    const stage = await resolveStage(rpcWith(['preview']), 'p1', undefined)
    assert.deepStrictEqual(stage, { stageId: 'stage-1', branch: 'preview' })
  })
})

describe('matchStage', () => {
  const rpc = {
    invoke: async () => ({
      stages: [
        {
          stageId: 'stage-main',
          branch: 'main',
          url: 'https://mono.pikkufabric.dev',
          containerUrl: null,
        },
        {
          stageId: 'stage-dev',
          branch: 'develop',
          url: 'https://fabric-develop-mono-ldx7tf65.pikkufabric.dev',
          containerUrl: null,
        },
      ],
    }),
  } as unknown as PikkuRPC

  test('by branch', async () => {
    assert.strictEqual(
      (await matchStage(rpc, 'p1', 'develop')).stageId,
      'stage-dev'
    )
  })

  test('by the url it was filed on, path and scheme optional', async () => {
    for (const ref of [
      'https://fabric-develop-mono-ldx7tf65.pikkufabric.dev',
      'https://fabric-develop-mono-ldx7tf65.pikkufabric.dev/en/jobs',
      'fabric-develop-mono-ldx7tf65.pikkufabric.dev',
    ]) {
      assert.strictEqual((await matchStage(rpc, 'p1', ref)).branch, 'develop')
    }
  })

  test('by id', async () => {
    assert.strictEqual(
      (await matchStage(rpc, 'p1', 'stage-main')).branch,
      'main'
    )
  })

  test('an unknown name lists the stages there are', async () => {
    await assert.rejects(
      matchStage(rpc, 'p1', 'staging'),
      /No stage matches "staging"\. Stages: main \(https:\/\/mono\.pikkufabric\.dev\), develop/
    )
  })
})

type HintStage = {
  branch: string
  autoDeployOnPush: boolean
  deployments: { status: string; statusReason: string | null }[]
}

const deploymentsRpc = (stages: HintStage[]) =>
  ({
    invoke: async (name: string) => {
      assert.strictEqual(name, 'getProjectDeployments')
      return { stages }
    },
  }) as unknown as PikkuRPC

const waiting = (statusReason: string | null = 'awaiting_approval') => ({
  status: 'suspended',
  statusReason,
})

describe('autoDeployOffHints', () => {
  test('names the branch and the command that would turn it on', async () => {
    const hints = await autoDeployOffHints(
      deploymentsRpc([
        {
          branch: 'staging',
          autoDeployOnPush: false,
          deployments: [waiting()],
        },
      ]),
      'p1'
    )
    assert.deepStrictEqual(hints, [
      'waiting for approval — auto-deploy is off (pikku fabric deploy auto on -b staging)',
    ])
  })

  test('says nothing when auto-deploy is already on', async () => {
    const hints = await autoDeployOffHints(
      deploymentsRpc([
        { branch: 'main', autoDeployOnPush: true, deployments: [waiting()] },
      ]),
      'p1'
    )
    assert.deepStrictEqual(hints, [])
  })

  test('says nothing about a suspension that is not an approval wait', async () => {
    const hints = await autoDeployOffHints(
      deploymentsRpc([
        {
          branch: 'main',
          autoDeployOnPush: false,
          deployments: [waiting('org_cannot_pay')],
        },
      ]),
      'p1'
    )
    assert.deepStrictEqual(hints, [])
  })

  test('says nothing when the stage has no waiting deployment', async () => {
    const hints = await autoDeployOffHints(
      deploymentsRpc([
        {
          branch: 'main',
          autoDeployOnPush: false,
          deployments: [{ status: 'succeeded', statusReason: null }],
        },
      ]),
      'p1'
    )
    assert.deepStrictEqual(hints, [])
  })

  test('still points at a branch whose own stage is not waiting', async () => {
    const hints = await autoDeployOffHints(
      deploymentsRpc([
        {
          branch: 'main',
          autoDeployOnPush: false,
          deployments: [waiting()],
        },
        {
          branch: 'preview',
          autoDeployOnPush: false,
          deployments: [waiting()],
        },
      ]),
      'p1',
      'preview'
    )
    assert.deepStrictEqual(hints, [
      'waiting for approval — auto-deploy is off (pikku fabric deploy auto on -b preview)',
    ])
  })

  test('ignores the other branches when one is asked about', async () => {
    const hints = await autoDeployOffHints(
      deploymentsRpc([
        {
          branch: 'main',
          autoDeployOnPush: false,
          deployments: [waiting()],
        },
      ]),
      'p1',
      'preview'
    )
    assert.deepStrictEqual(hints, [])
  })
})
