import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CodeEditService } from './code-edit.service.js'

let tempDir: string
let service: CodeEditService

async function createTempFile(name: string, content: string): Promise<string> {
  const filePath = join(tempDir, name)
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

async function readTempFile(name: string): Promise<string> {
  return readFile(join(tempDir, name), 'utf-8')
}

const FUNCTION_SOURCE = `import { pikkuSessionlessFunc } from '@pikku/core'

export const listTodos = pikkuSessionlessFunc<ListInput, ListOutput>({
  description: 'Lists all todos for a user',
  tags: ['todos', 'read'],
  expose: true,
  func: async ({ logger, todoStore }, { userId }) => {
    const todos = await todoStore.list(userId)
    return { todos }
  },
})
`

const FUNCTION_NO_TRAILING_COMMA = `import { pikkuFunc } from '@pikku/core'

export const createTodo = pikkuFunc({
  description: 'Create a todo',
  mcp: true,
  func: async ({ todoStore }, data) => {
    return await todoStore.create(data)
  }
})
`

const AGENT_SOURCE = `import { pikkuAIAgent } from '@pikku/core'

export const todoAssistant = pikkuAIAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  role: 'You are a todo management specialist.',
  personality: 'Be concise and helpful.',
  goal: 'Help users manage their todo lists.',
  model: 'openai/gpt-4o-mini',
  maxSteps: 5,
  toolChoice: 'auto',
  tools: [listTodos, createTodo],
})
`

const MULTI_FUNCTION_SOURCE = `import { pikkuSessionlessFunc } from '@pikku/core'

export const funcA = pikkuSessionlessFunc({
  description: 'Function A',
  func: async () => 'a',
})

export const funcB = pikkuSessionlessFunc({
  description: 'Function B',
  expose: true,
  func: async () => 'b',
})
`

describe('CodeEditService', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pikku-code-edit-'))
    service = new CodeEditService(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('readFunctionSource', () => {
    test('reads config properties and function body', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      const result = await service.readFunctionSource(
        join(tempDir, 'funcs.ts'),
        'listTodos'
      )

      assert.strictEqual(result.wrapperName, 'pikkuSessionlessFunc')
      assert.strictEqual(result.config.title, 'List Todos')
      assert.strictEqual(
        result.config.description,
        'Lists all todos for a user'
      )
      assert.deepStrictEqual(result.config.tags, ['todos', 'read'])
      assert.strictEqual(result.config.expose, true)
      assert.ok(result.body)
      assert.ok(result.body!.includes('todoStore.list(userId)'))
    })

    test('excludes func property from config', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      const result = await service.readFunctionSource(
        join(tempDir, 'funcs.ts'),
        'listTodos'
      )

      assert.strictEqual(result.config.func, undefined)
    })

    test('returns null body when no func property exists', async () => {
      const source = `export const myConfig = pikkuSessionlessFunc({
  description: 'No func here',
  expose: true,
})`
      await createTempFile('no-func.ts', source)

      const result = await service.readFunctionSource(
        join(tempDir, 'no-func.ts'),
        'myConfig'
      )

      assert.strictEqual(result.body, null)
    })

    test('throws for non-existent exported name', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await assert.rejects(
        () =>
          service.readFunctionSource(join(tempDir, 'funcs.ts'), 'nonExistent'),
        /Could not find exported variable 'nonExistent'/
      )
    })

    test('finds correct function in multi-function file', async () => {
      await createTempFile('multi.ts', MULTI_FUNCTION_SOURCE)

      const resultA = await service.readFunctionSource(
        join(tempDir, 'multi.ts'),
        'funcA'
      )
      assert.strictEqual(resultA.config.description, 'Function A')
      assert.strictEqual(resultA.config.expose, undefined)

      const resultB = await service.readFunctionSource(
        join(tempDir, 'multi.ts'),
        'funcB'
      )
      assert.strictEqual(resultB.config.description, 'Function B')
      assert.strictEqual(resultB.config.expose, true)
    })

    test('parses numeric values correctly', async () => {
      const source = `export const myFunc = pikkuSessionlessFunc({
  maxSteps: 10,
  temperature: 0.7,
  func: async () => {},
})`
      await createTempFile('nums.ts', source)

      const result = await service.readFunctionSource(
        join(tempDir, 'nums.ts'),
        'myFunc'
      )

      assert.strictEqual(result.config.maxSteps, 10)
      assert.strictEqual(result.config.temperature, 0.7)
    })
  })

  describe('readFunctionBody', () => {
    test('returns the function body', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      const body = await service.readFunctionBody(
        join(tempDir, 'funcs.ts'),
        'listTodos'
      )

      assert.ok(body.includes('todoStore.list(userId)'))
      assert.ok(body.includes('return { todos }'))
    })

    test('throws when no func property exists', async () => {
      const source = `export const noFunc = pikkuSessionlessFunc({
  description: 'No func',
})`
      await createTempFile('no-func.ts', source)

      await assert.rejects(
        () => service.readFunctionBody(join(tempDir, 'no-func.ts'), 'noFunc'),
        /No 'func' property found/
      )
    })
  })

  describe('updateFunctionConfig', () => {
    test('updates an existing string property', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { description: 'Updated description' }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes("'Updated description'"))
      assert.ok(!updated.includes('Lists all todos for a user'))
    })

    test('updates a boolean property', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { expose: false }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes('expose: false'))
      assert.ok(!updated.includes('expose: true'))
    })

    test('adds a new property', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { mcp: true }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes('mcp: true'))
    })

    test('removes a property by setting null', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { tags: null }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(!updated.includes('tags:'))
      // Other properties should still be there
      assert.ok(updated.includes("title: 'List Todos'"))
      assert.ok(updated.includes('expose: true'))
    })

    test('updates array property', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { tags: ['updated', 'tags'] }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes("['updated', 'tags']"))
    })

    test('preserves function body when updating config', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { title: 'New Title' }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes('todoStore.list(userId)'))
      assert.ok(updated.includes('return { todos }'))
    })

    test('preserves import statements', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { description: 'Changed' }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(
        updated.includes("import { pikkuSessionlessFunc } from '@pikku/core'")
      )
    })

    test('handles multiple changes at once', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        {
          title: 'New Title',
          description: null,
          mcp: true,
          expose: false,
        }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes("title: 'New Title'"))
      assert.ok(!updated.includes('Lists all todos'))
      assert.ok(updated.includes('mcp: true'))
      assert.ok(updated.includes('expose: false'))
    })

    test('only modifies the target function in multi-function file', async () => {
      await createTempFile('multi.ts', MULTI_FUNCTION_SOURCE)

      await service.updateFunctionConfig(join(tempDir, 'multi.ts'), 'funcA', {
        description: 'Updated A',
      })

      const updated = await readTempFile('multi.ts')
      assert.ok(updated.includes("'Updated A'"))
      assert.ok(updated.includes("'Function B'"))
    })

    test('result is valid TypeScript after update', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { title: 'New Title', summary: 'A summary' }
      )

      const updated = await readTempFile('funcs.ts')
      // Verify we can re-read the updated file without errors
      const result = await service.readFunctionSource(
        join(tempDir, 'funcs.ts'),
        'listTodos'
      )
      assert.strictEqual(result.config.title, 'New Title')
      assert.strictEqual(result.config.summary, 'A summary')
    })
  })

  describe('updateFunctionBody', () => {
    test('replaces the function body', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      const newBody = `async ({ logger }, { userId }) => {
    logger.info('new impl')
    return { todos: [] }
  }`
      await service.updateFunctionBody(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        newBody
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes("logger.info('new impl')"))
      assert.ok(updated.includes('return { todos: [] }'))
      assert.ok(!updated.includes('todoStore.list(userId)'))
    })

    test('preserves config properties when updating body', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionBody(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        'async () => ({ todos: [] })'
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes("title: 'List Todos'"))
      assert.ok(updated.includes("description: 'Lists all todos for a user'"))
      assert.ok(updated.includes('expose: true'))
    })
  })

  describe('readAgentSource', () => {
    test('reads all agent config properties', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      const result = await service.readAgentSource(
        join(tempDir, 'agent.ts'),
        'todoAssistant'
      )

      assert.strictEqual(result.config.name, 'todo-assistant')
      assert.strictEqual(
        result.config.description,
        'A helpful assistant that manages todos'
      )
      assert.strictEqual(
        result.config.role,
        'You are a todo management specialist.'
      )
      assert.strictEqual(result.config.personality, 'Be concise and helpful.')
      assert.strictEqual(
        result.config.goal,
        'Help users manage their todo lists.'
      )
      assert.strictEqual(result.config.model, 'openai/gpt-4o-mini')
      assert.strictEqual(result.config.maxSteps, 5)
      assert.strictEqual(result.config.toolChoice, 'auto')
    })

    test('returns raw text for non-literal values (function refs)', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      const result = await service.readAgentSource(
        join(tempDir, 'agent.ts'),
        'todoAssistant'
      )

      // tools: [listTodos, createTodo] — these are identifier refs, not strings
      assert.ok(result.config.tools !== undefined)
    })
  })

  describe('updateAgentConfig', () => {
    test('updates agent goal', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        { goal: 'Manage complex project workflows.' }
      )

      const updated = await readTempFile('agent.ts')
      assert.ok(updated.includes("'Manage complex project workflows.'"))
      assert.ok(!updated.includes('Help users manage their todo lists.'))
    })

    test('updates agent model', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        { model: 'anthropic/claude-sonnet-4-6' }
      )

      const updated = await readTempFile('agent.ts')
      assert.ok(updated.includes("'anthropic/claude-sonnet-4-6'"))
      assert.ok(!updated.includes('openai/gpt-4o-mini'))
    })

    test('updates agent maxSteps', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        { maxSteps: 10 }
      )

      const updated = await readTempFile('agent.ts')
      assert.ok(updated.includes('maxSteps: 10'))
      assert.ok(!updated.includes('maxSteps: 5'))
    })

    test('removes agent toolChoice by setting null', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        { toolChoice: null }
      )

      const updated = await readTempFile('agent.ts')
      assert.ok(!updated.includes('toolChoice'))
      // Other properties preserved
      assert.ok(updated.includes("name: 'todo-assistant'"))
      assert.ok(updated.includes('maxSteps: 5'))
    })

    test('handles multi-line goal', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      const newGoal =
        'Manage todos.\nPrioritize by urgency.\nNever delete without asking.'
      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        { goal: newGoal }
      )

      const updated = await readTempFile('agent.ts')
      assert.ok(updated.includes('`Manage todos.'))
      assert.ok(updated.includes('Never delete without asking.`'))
    })

    test('preserves other agent properties on update', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        { description: 'Updated description' }
      )

      const updated = await readTempFile('agent.ts')
      assert.ok(updated.includes("name: 'todo-assistant'"))
      assert.ok(updated.includes('maxSteps: 5'))
      assert.ok(updated.includes('tools: [listTodos, createTodo]'))
    })

    test('roundtrip: update then read returns correct values', async () => {
      await createTempFile('agent.ts', AGENT_SOURCE)

      await service.updateAgentConfig(
        join(tempDir, 'agent.ts'),
        'todoAssistant',
        {
          role: 'You are a project manager.',
          goal: 'Coordinate team tasks.',
          model: 'anthropic/claude-sonnet-4-6',
          maxSteps: 20,
        }
      )

      const result = await service.readAgentSource(
        join(tempDir, 'agent.ts'),
        'todoAssistant'
      )

      assert.strictEqual(result.config.role, 'You are a project manager.')
      assert.strictEqual(result.config.goal, 'Coordinate team tasks.')
      assert.strictEqual(result.config.model, 'anthropic/claude-sonnet-4-6')
      assert.strictEqual(result.config.maxSteps, 20)
      // Unchanged properties
      assert.strictEqual(result.config.name, 'todo-assistant')
    })
  })

  describe('resolvePath', () => {
    test('absolute paths are used as-is', async () => {
      const absPath = join(tempDir, 'abs.ts')
      await writeFile(
        absPath,
        `export const x = pikkuSessionlessFunc({ description: 'test' })`,
        'utf-8'
      )

      const result = await service.readFunctionSource(absPath, 'x')
      assert.strictEqual(result.config.description, 'test')
    })

    test('relative paths resolve from rootDir', async () => {
      await createTempFile(
        'rel.ts',
        `export const x = pikkuSessionlessFunc({ description: 'relative' })`
      )

      const result = await service.readFunctionSource('rel.ts', 'x')
      assert.strictEqual(result.config.description, 'relative')
    })
  })

  describe('edge cases', () => {
    test('handles pikkuFunc wrapper (not sessionless)', async () => {
      await createTempFile('funcs.ts', FUNCTION_NO_TRAILING_COMMA)

      const result = await service.readFunctionSource(
        join(tempDir, 'funcs.ts'),
        'createTodo'
      )

      assert.strictEqual(result.wrapperName, 'pikkuFunc')
      assert.strictEqual(result.config.description, 'Create a todo')
      assert.strictEqual(result.config.mcp, true)
    })

    test('handles function with no trailing comma on last property', async () => {
      await createTempFile('funcs.ts', FUNCTION_NO_TRAILING_COMMA)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'createTodo',
        { expose: true }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes('expose: true'))

      // Verify it's still parseable
      const result = await service.readFunctionSource(
        join(tempDir, 'funcs.ts'),
        'createTodo'
      )
      assert.strictEqual(result.config.expose, true)
    })

    test('handles strings with single quotes', async () => {
      await createTempFile(
        'quotes.ts',
        `export const x = pikkuSessionlessFunc({ description: 'test' })`
      )

      await service.updateFunctionConfig(join(tempDir, 'quotes.ts'), 'x', {
        description: "it's a test",
      })

      const updated = await readTempFile('quotes.ts')
      assert.ok(updated.includes("it\\'s a test"))
    })

    test('handles empty tags array', async () => {
      await createTempFile('funcs.ts', FUNCTION_SOURCE)

      await service.updateFunctionConfig(
        join(tempDir, 'funcs.ts'),
        'listTodos',
        { tags: [] }
      )

      const updated = await readTempFile('funcs.ts')
      assert.ok(updated.includes('tags: []'))
    })
  })
})
