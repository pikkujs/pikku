import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  AgentOutputValidationError,
  UnprocessableContentError,
} from '../../errors/errors.js'
import type {
  AgentRunnerService,
  AgentStepResult,
} from '../../services/agent-runner-service.js'
import { runAgent } from './agent-runner.js'
import { dropNullOptionals, validateAgentOutput } from './agent-output.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

const stepResult = (object: unknown): AgentStepResult => ({
  text: '',
  object,
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
})

/** A runner that answers every call with `object`, recording what it was sent. */
const answering = (object: unknown) => {
  const sent: unknown[] = []
  const runner = {
    run: async (params: { outputSchema?: unknown }) => {
      sent.push(params.outputSchema)
      return stepResult(object)
    },
    stream: async () => stepResult(object),
  } as unknown as AgentRunnerService
  return { runner, sent }
}

describe('dropNullOptionals', () => {
  const schema = {
    type: 'object',
    required: ['a', 'list'],
    properties: {
      a: { type: 'string' },
      b: { type: 'string' },
      c: { type: ['string', 'null'] },
      list: {
        type: 'array',
        items: {
          type: 'object',
          properties: { d: { type: 'number' } },
        },
      },
    },
  }

  test('drops a null only where the field is optional and not nullable', () => {
    assert.deepEqual(
      dropNullOptionals(schema, {
        a: null,
        b: null,
        c: null,
        list: [{ d: null }, { d: 1 }],
      }),
      { a: null, c: null, list: [{}, { d: 1 }] }
    )
  })
})

describe("a pikkuAgent's declared output", () => {
  const validated: unknown[] = []

  beforeEach(() => {
    resetPikkuState()
    validated.length = 0
    pikkuState(null, 'misc', 'schemas').set('ReviewOutput', {
      type: 'object',
      required: ['score'],
      properties: { score: { type: 'number' }, notes: { type: 'string' } },
    })
  })

  const withSchemaService = (agentRunner?: unknown) =>
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      agentRunner,
      agentRunState: {
        createRun: async () => 'run-1',
        updateRun: async (_id: string, patch: unknown) => {
          validated.push(patch)
        },
      },
      schema: {
        compileSchema: () => {},
        validateSchema: (_name: string, data: any) => {
          if (typeof data.score !== 'number') {
            throw new UnprocessableContentError('score must be number')
          }
        },
      },
    } as any)

  const addReviewer = () => {
    const agent = {
      name: 'reviewer',
      description: 'reviews',
      instructions: 'review',
      model: 'test/test-model',
    }
    pikkuState(null, 'agent', 'agentsMeta').reviewer = {
      ...agent,
      inputSchema: null,
      outputSchema: 'ReviewOutput',
      workingMemorySchema: null,
    } as any
    pikkuState(null, 'agent', 'agents').set('reviewer', agent as any)
  }

  test('validateAgentOutput returns the object with optional nulls dropped', async () => {
    withSchemaService()

    assert.deepEqual(
      await validateAgentOutput('reviewer', 'ReviewOutput', {
        score: 3,
        notes: null,
      }),
      { score: 3 }
    )
  })

  test('runAgent fails the run when the model object does not match', async () => {
    addReviewer()
    withSchemaService(answering({ score: 'high' }).runner)

    await assert.rejects(
      runAgent(
        'reviewer',
        { message: 'review this', threadId: 't', resourceId: 'r' },
        {}
      ),
      (error: unknown) => {
        assert.ok(error instanceof AgentOutputValidationError)
        assert.deepEqual(error.issues, ['score must be number'])
        return true
      }
    )
    assert.deepEqual(validated.at(-1), {
      status: 'failed',
      errorMessage:
        "Agent 'reviewer' returned output that does not match its output schema: score must be number",
    })
  })

  test('runAgent returns a matching object', async () => {
    addReviewer()
    withSchemaService(answering({ score: 5, notes: null }).runner)

    const result = await runAgent(
      'reviewer',
      { message: 'review this', threadId: 't', resourceId: 'r' },
      {}
    )

    assert.deepEqual(result.object, { score: 5 })
  })
})
