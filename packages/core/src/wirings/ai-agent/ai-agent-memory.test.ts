import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState } from '../../pikku-state.js'
import {
  buildWorkingMemoryPrompt,
  createWorkingMemoryMiddleware,
  deepMergeWorkingMemory,
  loadContextMessages,
  parseWorkingMemory,
  resolveMemoryServices,
  saveMessages,
  stripWorkingMemoryTags,
  trimMessages,
} from './ai-agent-memory.js'
import type { AIMessage, CoreAIAgent } from './ai-agent.types.js'

beforeEach(() => {
  resetPikkuState()
})

const makeMessage = (overrides: Partial<AIMessage>): AIMessage => ({
  id: 'msg',
  role: 'user',
  content: 'hello',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

describe('ai-agent-memory', () => {
  test('resolveMemoryServices prefers named storage and falls back to aiStorage', () => {
    const singletonServices = {
      aiStorage: { kind: 'default' },
      customStorage: { kind: 'custom' },
    } as any

    const defaultAgent = {} as CoreAIAgent
    const namedAgent = { memory: { storage: 'customStorage' } } as CoreAIAgent

    assert.equal(
      resolveMemoryServices(defaultAgent, singletonServices).storage,
      singletonServices.aiStorage
    )
    assert.equal(
      resolveMemoryServices(namedAgent, singletonServices).storage,
      singletonServices.customStorage
    )
  })

  test('deepMergeWorkingMemory merges nested objects and deletes null fields', () => {
    const result = deepMergeWorkingMemory(
      {
        profile: {
          name: 'Yasser',
          stats: { commits: 1, reviews: 2 },
        },
        stale: true,
      },
      {
        profile: {
          stats: { reviews: 3 },
        },
        stale: null,
        active: false,
      }
    )

    assert.deepEqual(result, {
      profile: {
        name: 'Yasser',
        stats: { commits: 1, reviews: 3 },
      },
      active: false,
    })
  })

  test('buildWorkingMemoryPrompt includes schema fields and current state', () => {
    const prompt = buildWorkingMemoryPrompt(
      { city: 'Berlin' },
      {
        properties: {
          city: { type: 'string', description: 'Current city' },
          age: { type: 'number' },
        },
      }
    )

    assert.match(prompt, /Working memory fields:/)
    assert.match(prompt, /city \(string\) - Current city/)
    assert.match(prompt, /age \(number\)/)
    assert.match(prompt, /Current working memory:\n\{"city":"Berlin"\}/)
    assert.match(prompt, /<working_memory>/)
  })

  test('buildWorkingMemoryPrompt marks empty memory explicitly', () => {
    const prompt = buildWorkingMemoryPrompt(null)
    assert.match(prompt, /Current working memory: \(empty\)/)
  })

  test('loadContextMessages injects working memory system prompt when enabled', async () => {
    const storage = {
      getWorkingMemory: async () => ({ city: 'Berlin' }),
    } as any

    const messages = await loadContextMessages(
      { workingMemory: true },
      storage,
      { message: 'hello', threadId: 'thread-1', resourceId: 'resource-1' },
      { properties: { city: { type: 'string' } } }
    )

    assert.equal(messages.length, 1)
    assert.equal(messages[0].role, 'system')
    assert.match(String(messages[0].content), /Current working memory:/)
  })

  test('loadContextMessages returns no messages without storage', async () => {
    const messages = await loadContextMessages(
      { workingMemory: true },
      undefined,
      { message: 'hello', threadId: 'thread-1', resourceId: 'resource-1' }
    )
    assert.deepEqual(messages, [])
  })

  test('saveMessages persists tool calls and strips working memory tags from returned text', async () => {
    const savedMessages: AIMessage[][] = []

    const storage = {
      saveMessages: async (_threadId: string, messages: AIMessage[]) => {
        savedMessages.push(messages)
      },
    } as any

    const resultText = await saveMessages(
      storage,
      'thread-1',
      'resource-1',
      { workingMemory: true },
      makeMessage({ id: 'user-1' }),
      {
        text: 'Done <working_memory>{"city":"Berlin"}</working_memory>',
        steps: [
          {
            toolCalls: [
              {
                name: 'tool-1',
                args: { q: 'hello' },
                result: 'world',
              },
            ],
          },
        ],
      }
    )

    assert.equal(resultText, 'Done')
    assert.equal(savedMessages.length, 1)
    assert.equal(savedMessages[0].length, 4)
    assert.equal(savedMessages[0][0].role, 'user')
    assert.equal(savedMessages[0][1].role, 'assistant')
    assert.equal(savedMessages[0][2].role, 'tool')
    assert.equal(savedMessages[0][3].role, 'assistant')
  })

  test('saveMessages returns text unchanged when no storage is configured', async () => {
    const passthrough = await saveMessages(
      undefined,
      'thread-1',
      'resource-1',
      { workingMemory: true },
      null,
      { text: 'plain text', steps: [] }
    )
    assert.equal(passthrough, 'plain text')
  })

  test('createWorkingMemoryMiddleware merges, validates, and persists working memory', async () => {
    const savedWorkingMemory: unknown[] = []
    const warnings: string[] = []

    const storage = {
      getWorkingMemory: async () => ({ city: 'Paris', removeMe: 'x' }),
      saveWorkingMemory: async (
        threadId: string,
        scope: string,
        value: unknown
      ) => {
        savedWorkingMemory.push({ threadId, scope, value })
      },
    } as any

    const mw = createWorkingMemoryMiddleware({
      storage,
      threadId: 'thread-1',
      workingMemorySchemaName: 'WorkingMemory',
      schemaService: { validateSchema: async () => {} } as any,
      logger: { warn: (message: string) => warnings.push(message) } as any,
    })

    const result = (await mw.modifyOutput!({} as any, {
      text: 'Done <working_memory>{"city":"Berlin","removeMe":null}</working_memory>',
      messages: [],
      usage: {} as any,
    })) as { text: string }

    assert.equal(result.text, 'Done')
    assert.deepEqual(savedWorkingMemory, [
      {
        threadId: 'thread-1',
        scope: 'thread',
        value: { city: 'Berlin' },
      },
    ])
    assert.deepEqual(warnings, [])
  })

  test('createWorkingMemoryMiddleware warns and skips persistence on schema failure', async () => {
    const savedWorkingMemory: unknown[] = []
    const warnings: string[] = []

    const storage = {
      getWorkingMemory: async () => ({}),
      saveWorkingMemory: async (...args: unknown[]) => {
        savedWorkingMemory.push(args)
      },
    } as any

    const mw = createWorkingMemoryMiddleware({
      storage,
      threadId: 'thread-1',
      workingMemorySchemaName: 'WorkingMemory',
      schemaService: {
        validateSchema: async () => {
          throw new Error('bad schema')
        },
      } as any,
      logger: { warn: (message: string) => warnings.push(message) } as any,
    })

    const result = (await mw.modifyOutput!({} as any, {
      text: '<working_memory>{"city":"Berlin"}</working_memory>',
      messages: [],
      usage: {} as any,
    })) as { text: string }

    assert.equal(result.text, '')
    assert.deepEqual(warnings, ['Working memory validation failed: bad schema'])
    assert.deepEqual(savedWorkingMemory, [])
  })

  test('trimMessages sanitizes orphaned tool messages and keeps first user/system boundary', () => {
    const messages: AIMessage[] = [
      makeMessage({
        id: 'assistant-1',
        role: 'assistant',
        content: 'tool call text',
        toolCalls: [{ id: 'tc-1', name: 'tool', args: { x: 1 } }],
      }),
      makeMessage({
        id: 'tool-1',
        role: 'tool',
        toolResults: [{ id: 'other', name: 'tool', result: 'wrong' }],
      }),
      makeMessage({
        id: 'user-1',
        role: 'user',
        content: 'real user message',
      }),
      makeMessage({
        id: 'assistant-2',
        role: 'assistant',
        content: 'final answer',
      }),
    ]

    const trimmed = trimMessages(messages, 1000)
    assert.equal(trimmed[0].role, 'user')
    assert.equal(trimmed[1].role, 'assistant')
    assert.equal(trimmed[1].content, 'final answer')
  })

  test('trimMessages keeps latest message even when over token budget', () => {
    const trimmed = trimMessages(
      [makeMessage({ content: 'a'.repeat(1000) })],
      1
    )
    assert.equal(trimmed.length, 1)
  })

  test('parseWorkingMemory and stripWorkingMemoryTags handle valid and invalid payloads', () => {
    assert.deepEqual(
      parseWorkingMemory(
        'a <working_memory>{"city":"Berlin"}</working_memory> b'
      ),
      { city: 'Berlin' }
    )
    assert.equal(
      parseWorkingMemory('<working_memory>{oops}</working_memory>'),
      null
    )
    assert.equal(
      stripWorkingMemoryTags(
        'before <working_memory>{"city":"Berlin"}</working_memory> after'
      ),
      'before  after'.trim()
    )
  })
})
