import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  agent,
  agentStream,
  agentResume,
  agentApprove,
} from './ai-agent-helpers.js'

describe('agent helpers', () => {
  describe('agent', () => {
    test('should return an object with func', () => {
      const a = agent('myAgent')
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.run', async () => {
      const a = agent('myAgent')
      let calledWith: any
      const rpc = {
        agent: {
          run: async (...args: any[]) => {
            calledWith = args
            return {
              runId: 'run-1',
              result: 'done',
              usage: { inputTokens: 10, outputTokens: 20 },
            }
          },
        },
      }
      const input = { message: 'hello', threadId: 't1', resourceId: 'r1' }
      const result = await a.func({}, input, { rpc })
      assert.strictEqual(calledWith[0], 'myAgent')
      assert.deepStrictEqual(calledWith[1], input)
      assert.strictEqual(result.runId, 'run-1')
    })
  })

  describe('agentStream', () => {
    test('should return an object with func', () => {
      const a = agentStream('myAgent')
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.stream', async () => {
      const a = agentStream('myAgent')
      let calledWith: any
      const rpc = {
        agent: {
          stream: async (...args: any[]) => {
            calledWith = args
          },
        },
      }
      const input = { message: 'hello', threadId: 't1', resourceId: 'r1' }
      await a.func({}, input, { rpc })
      assert.strictEqual(calledWith[0], 'myAgent')
      assert.deepStrictEqual(calledWith[1], input)
    })
  })

  describe('agentResume', () => {
    test('should return an object with func', () => {
      const a = agentResume()
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.resume', async () => {
      const a = agentResume()
      let calledWith: any
      const rpc = {
        agent: {
          resume: async (...args: any[]) => {
            calledWith = args
          },
        },
      }
      const data = { runId: 'run-1', toolCallId: 'tc1', approved: true }
      await a.func({}, data, { rpc })
      assert.strictEqual(calledWith[0], 'run-1')
      assert.deepStrictEqual(calledWith[1], {
        toolCallId: 'tc1',
        approved: true,
      })
    })
  })

  describe('agentApprove', () => {
    test('should return an object with func', () => {
      const a = agentApprove('myAgent')
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.approve', async () => {
      const a = agentApprove('myAgent')
      let calledWith: any
      const rpc = {
        agent: {
          approve: async (...args: any[]) => {
            calledWith = args
            return { approved: true }
          },
        },
      }
      const data = {
        runId: 'run-1',
        approvals: [{ toolCallId: 'tc1', approved: true }],
      }
      const result = await a.func({}, data, { rpc })
      assert.strictEqual(calledWith[0], 'run-1')
      assert.deepStrictEqual(calledWith[1], [
        { toolCallId: 'tc1', approved: true },
      ])
      assert.deepStrictEqual(result, { approved: true })
    })
  })
})
