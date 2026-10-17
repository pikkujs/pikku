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
import {
  dropNullOptionals,
  runAgentStructured,
  validateAgentOutput,
} from './agent-output.js'
import type { AgentOutputSchema } from './agent-output.js'

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

type Review = { score: number; verdict: 'pass' | 'fail'; notes?: string }

const reviewJsonSchema = {
  type: 'object',
  required: ['score', 'verdict'],
  properties: {
    score: { type: 'number' },
    verdict: { enum: ['pass', 'fail'] },
    notes: { type: 'string' },
  },
}

/**
 * A Standard Schema that also converts to JSON Schema — the shape zod 4 has —
 * written out by hand so core takes no schema library for its tests.
 */
const Review: AgentOutputSchema<Review> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => {
      const v = value as Record<string, unknown>
      const issues = [
        typeof v.score !== 'number' && {
          message: 'expected number',
          path: ['score'],
        },
        !['pass', 'fail'].includes(v.verdict as string) && {
          message: 'expected pass or fail',
          path: ['verdict'],
        },
        'notes' in v &&
          typeof v.notes !== 'string' && {
            message: 'expected string',
            path: ['notes'],
          },
      ].filter((issue) => !!issue)
      return issues.length ? { issues } : { value: v as Review }
    },
    jsonSchema: {
      input: () => reviewJsonSchema,
      output: () => reviewJsonSchema,
    },
  },
}

const baseParams = {
  model: 'test/model',
  instructions: 'review it',
  messages: [],
  tools: [],
  maxSteps: 1,
  toolChoice: 'none' as const,
}

describe('runAgentStructured', () => {
  test('a valid object comes back typed', async () => {
    const { runner, sent } = answering({ score: 4, verdict: 'pass' })

    const { object } = await runAgentStructured(runner, {
      ...baseParams,
      outputSchema: Review,
    })

    const score: number = object.score
    // @ts-expect-error — `object` is the schema's output type, not `unknown`
    const missing: string = object.verdictText
    assert.equal(score, 4)
    assert.equal(missing, undefined)
    assert.deepEqual(object, { score: 4, verdict: 'pass' })
    assert.equal((sent[0] as { type: string }).type, 'object')
  })

  test('a wrong-typed field throws AgentOutputValidationError', async () => {
    const { runner } = answering({ score: 'four', verdict: 'pass' })

    await assert.rejects(
      runAgentStructured(runner, {
        ...baseParams,
        agentId: 'reviewer',
        outputSchema: Review,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AgentOutputValidationError)
        assert.equal(error.agentName, 'reviewer')
        assert.match(error.issues[0]!, /^score: /)
        return true
      }
    )
  })

  test('a missing required field throws', async () => {
    const { runner } = answering({ score: 4 })

    await assert.rejects(
      runAgentStructured(runner, { ...baseParams, outputSchema: Review }),
      AgentOutputValidationError
    )
  })

  test('null for an optional field passes, as absent', async () => {
    const { runner } = answering({ score: 4, verdict: 'fail', notes: null })

    const { object } = await runAgentStructured(runner, {
      ...baseParams,
      outputSchema: Review,
    })

    assert.deepEqual(object, { score: 4, verdict: 'fail' })
  })

  test('no object at all throws rather than returning text as the object', async () => {
    const { runner } = answering(undefined)

    await assert.rejects(
      runAgentStructured(runner, { ...baseParams, outputSchema: Review }),
      /no structured output/
    )
  })
})

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
