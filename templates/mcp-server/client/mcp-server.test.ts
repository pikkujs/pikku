import { test } from 'node:test'
import assert from 'node:assert'
import { PikkuMCPTestClient } from './mcp.js'

const TEST_SERVER_COMMAND = process.env.MCP_SERVER_COMMAND || 'npx'
const TEST_SERVER_ARGS = process.env.MCP_SERVER_START
  ? [process.env.MCP_SERVER_START]
  : ['tsx', 'src/start.ts']

test('MCP Server - Basic Connection and Capabilities', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    const tools = await client.listTools()
    assert.ok(tools.tools, 'Should have tools')
    assert.ok(Array.isArray(tools.tools), 'Tools should be an array')

    const toolNames = tools.tools.map((tool: any) => tool.name)
    assert.ok(
      toolNames.includes('createTodoTool'),
      'Should have createTodoTool tool'
    )
    assert.ok(
      toolNames.includes('completeTodoTool'),
      'Should have completeTodoTool tool'
    )
    assert.ok(
      toolNames.includes('deleteTodoTool'),
      'Should have deleteTodoTool tool'
    )

    const resourceTemplates = await client.listResourceTemplates()
    assert.ok(
      resourceTemplates.resourceTemplates,
      'Should have resource templates'
    )
    assert.ok(
      Array.isArray(resourceTemplates.resourceTemplates),
      'Resource templates should be an array'
    )

    const templateUris = resourceTemplates.resourceTemplates.map(
      (rt: any) => rt.uriTemplate
    )
    assert.ok(
      templateUris.includes('todos/{id}'),
      'Should have todos/{id} resource template'
    )

    const prompts = await client.listPrompts()
    assert.ok(prompts.prompts, 'Should have prompts')
    assert.ok(Array.isArray(prompts.prompts), 'Prompts should be an array')

    const promptNames = prompts.prompts.map((prompt: any) => prompt.name)
    assert.ok(promptNames.includes('planDay'), 'Should have planDay prompt')
    assert.ok(
      promptNames.includes('prioritize'),
      'Should have prioritize prompt'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - createTodo Tool', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    const result = await client.callTool('createTodoTool', {
      title: 'Test todo from MCP',
      priority: 'high',
    })
    assert.ok(result.content, 'Should have content')
    assert.ok(
      result.content[0].text.includes('Created todo'),
      'Should confirm todo creation'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - getTodoResource Resource Template', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    const resourceResult = await client.readResource('todos/test123', {})
    assert.ok(resourceResult.contents, 'Should have contents')
    assert.ok(resourceResult.contents[0].text, 'Should have text content')

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - Full Integration Test', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    await client.runFullTest()

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})
