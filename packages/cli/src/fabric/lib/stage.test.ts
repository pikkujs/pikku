import { describe, test } from 'node:test'
import assert from 'node:assert'
import { resolveStage, resolveStageId } from './stage.js'
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
