import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { knowledgeGaps } from './knowledge-gaps.js'

describe('pikku knowledge gaps', () => {
  test('asks the changes addon, which knows what is already filed', async () => {
    const calls: { name: string; data: unknown }[] = []
    const answer = { gaps: [] }
    const rpc = {
      invoke: async (name: string, data: unknown) => {
        calls.push({ name, data })
        return answer
      },
    }

    const result = await knowledgeGaps.func(
      {} as any,
      {} as any,
      {
        rpc,
      } as any
    )

    assert.deepEqual(calls, [
      { name: 'changes:ChangesKnowledgeGaps', data: {} },
    ])
    assert.equal(result, answer)
  })
})
