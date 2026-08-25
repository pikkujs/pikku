import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  agent,
  agentStream,
  agentResume,
  agentApprove,
} from './agent-helpers.js'
import { agentCallOptions } from './agent-prepare.js'

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

    test('func should call rpc.agent.stream with bound name', async () => {
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

    test('func should extract agentName from data when no name bound', async () => {
      const a = agentStream()
      let calledWith: any
      const rpc = {
        agent: {
          stream: async (...args: any[]) => {
            calledWith = args
          },
        },
      }
      const input = {
        agentName: 'dynamicAgent',
        message: 'hello',
        threadId: 't1',
        resourceId: 'r1',
      }
      await a.func({}, input, { rpc })
      assert.strictEqual(calledWith[0], 'dynamicAgent')
      assert.deepStrictEqual(calledWith[1], {
        message: 'hello',
        threadId: 't1',
        resourceId: 'r1',
      })
    })

    test('func should throw when no name bound and no agentName in data', async () => {
      const a = agentStream()
      const rpc = { agent: { stream: async () => {} } }
      await assert.rejects(() => a.func({}, { message: 'hello' }, { rpc }), {
        message:
          'agentStream requires an agentName either as a parameter or in the input data',
      })
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

describe('agentCallOptions', () => {
  // An explicit `undefined` overrides the agent's own declared default with
  // nothing, so a request that names no model would silently unset the one the
  // agent declares.
  test('a field nobody supplied is left out rather than sent as undefined', () => {
    const options = agentCallOptions({
      message: 'hello',
      threadId: 't1',
      resourceId: 'r1',
    })
    assert.equal('model' in options, false)
    assert.equal('temperature' in options, false)
    assert.equal('context' in options, false)
    assert.equal('attachments' in options, false)
  })

  test('what was supplied is carried through unchanged', () => {
    const options = agentCallOptions({
      message: 'hello',
      threadId: 't1',
      resourceId: 'user-1',
      model: 'a-model',
      temperature: 0.2,
      context: 'some context',
      attachments: [{ type: 'image' as const, url: 'a.png' }],
    })
    assert.deepEqual(options, {
      message: 'hello',
      threadId: 't1',
      resourceId: 'user-1',
      attachments: [{ type: 'image' as const, url: 'a.png' }],
      model: 'a-model',
      temperature: 0.2,
      context: 'some context',
    })
  })

  // Zero is a temperature a caller can mean, and the falsy check every other
  // field uses would drop it.
  test('a temperature of zero survives, unlike an empty string', () => {
    assert.equal(
      agentCallOptions({
        message: 'x',
        threadId: 't',
        resourceId: 'r',
        temperature: 0,
      }).temperature,
      0
    )
    assert.equal(
      'context' in
        agentCallOptions({
          message: 'x',
          threadId: 't',
          resourceId: 'r',
          context: '',
        }),
      false
    )
  })
})
