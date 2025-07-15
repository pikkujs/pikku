import { test } from 'node:test'
import assert from 'node:assert'
import { PikkuMCPTestClient } from './pikku-mcp-client.js'

// Test configuration - adjust based on your MCP server setup
const TEST_SERVER_COMMAND = 'node'
const TEST_SERVER_ARGS = ['dist/mcp-server/src/start.js']

test('MCP Server - Basic Connection and Capabilities', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    // Test listing tools - should include sayHello, disableTool, and calculate
    const tools = await client.listTools()
    assert.ok(tools.tools, 'Should have tools')
    assert.ok(Array.isArray(tools.tools), 'Tools should be an array')

    const toolNames = tools.tools.map((tool: any) => tool.name)
    assert.ok(toolNames.includes('sayHello'), 'Should have sayHello tool')
    assert.ok(toolNames.includes('calculate'), 'Should have calculate tool')
    assert.ok(toolNames.includes('disableTool'), 'Should have disableTool tool')

    // Test listing resources - should include getStaticResource and getUserInfo
    const resources = await client.listResources()
    assert.ok(resources.resources, 'Should have resources')
    assert.ok(
      Array.isArray(resources.resources),
      'Resources should be an array'
    )

    const resourceUris = resources.resources.map(
      (resource: any) => resource.uri
    )
    assert.ok(
      resourceUris.includes('getStaticResource'),
      'Should have getStaticResource'
    )

    // Test listing prompts - should include getStaticResource and dynamicPromptGenerator
    const prompts = await client.listPrompts()
    assert.ok(prompts.prompts, 'Should have prompts')
    assert.ok(Array.isArray(prompts.prompts), 'Prompts should be an array')

    const promptNames = prompts.prompts.map((prompt: any) => prompt.name)
    assert.ok(
      promptNames.includes('getStaticResource'),
      'Should have getStaticResource prompt'
    )
    assert.ok(
      promptNames.includes('dynamicPromptGenerator'),
      'Should have dynamicPromptGenerator prompt'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - sayHello Tool', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    // Test sayHello without arguments (should use default "World")
    const helloWorld = await client.callTool('sayHello', {})
    assert.ok(helloWorld.content, 'Should have content')
    assert.ok(
      helloWorld.content[0].text.includes('Hello, World!'),
      'Should greet World by default'
    )

    // Test sayHello with custom name
    const helloCustom = await client.callTool('sayHello', { name: 'Claude' })
    assert.ok(helloCustom.content, 'Should have content')
    assert.ok(
      helloCustom.content[0].text.includes('Hello, Claude!'),
      'Should greet Claude'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - calculate Tool', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    // Test addition
    const addResult = await client.callTool('calculate', {
      operation: 'add',
      a: 5,
      b: 3,
    })
    assert.ok(addResult.content, 'Should have content')
    assert.ok(
      addResult.content[0].text.includes('8'),
      'Should calculate 5 + 3 = 8'
    )

    // Test multiplication
    const multiplyResult = await client.callTool('calculate', {
      operation: 'multiply',
      a: 4,
      b: 7,
    })
    assert.ok(multiplyResult.content, 'Should have content')
    assert.ok(
      multiplyResult.content[0].text.includes('28'),
      'Should calculate 4 * 7 = 28'
    )

    // Test division by zero (should throw error)
    try {
      await client.callTool('calculate', {
        operation: 'divide',
        a: 10,
        b: 0,
      })
      assert.fail('Should throw error for division by zero')
    } catch (error) {
      // Expected error
    }

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - getStaticResource Resource', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    const resourceResult = await client.readResource('getStaticResource', {})
    assert.ok(resourceResult.contents, 'Should have contents')
    assert.ok(resourceResult.contents[0].text, 'Should have text content')

    const content = JSON.parse(resourceResult.contents[0].text)
    assert.equal(
      content,
      'Hello! This is a static resource.',
      'Should return expected static content'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - getUserInfo Resource', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    // Test with valid user ID
    const userResult = await client.readResource('getUserInfo/123', {
      userId: '123',
    })
    assert.ok(userResult.contents, 'Should have contents')
    assert.ok(userResult.contents[0].text, 'Should have text content')

    const user = JSON.parse(userResult.contents[0].text)
    assert.equal(user.userId, '123', 'Should return correct user ID')
    assert.equal(user.name, 'John Doe', 'Should return correct user name')
    assert.equal(user.email, 'john@example.com', 'Should return correct email')

    // Test with invalid user ID (should throw error)
    try {
      await client.readResource('getUserInfo/999', { userId: '999' })
      assert.fail('Should throw error for invalid user ID')
    } catch (error) {
      // Expected error
    }

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - staticPromptGenerator Prompt', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    const promptResult = await client.getPrompt('getStaticResource', {})
    assert.ok(promptResult.messages, 'Should have messages')
    assert.ok(
      Array.isArray(promptResult.messages),
      'Messages should be an array'
    )
    assert.ok(
      promptResult.messages.length > 0,
      'Should have at least one message'
    )

    const message = promptResult.messages[0]
    assert.equal(message.role, 'user', 'Should be a user message')
    assert.ok(
      message.content.text.includes('static prompt example'),
      'Should contain expected text'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - dynamicPromptGenerator Prompt', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    // Test with basic arguments
    const basicPrompt = await client.getPrompt('dynamicPromptGenerator', {
      topic: 'JavaScript',
      complexity: 'beginner',
    })
    assert.ok(basicPrompt.messages, 'Should have messages')
    assert.ok(
      basicPrompt.messages.length > 0,
      'Should have at least one message'
    )

    const message = basicPrompt.messages[0]
    assert.equal(message.role, 'user', 'Should be a user message')
    assert.ok(
      message.content.text.includes('JavaScript'),
      'Should include the topic'
    )
    assert.ok(
      message.content.text.includes('beginner'),
      'Should include complexity level'
    )

    // Test with examples included
    const examplePrompt = await client.getPrompt('dynamicPromptGenerator', {
      topic: 'TypeScript',
      complexity: 'advanced',
      includeExamples: 'true',
    })
    assert.ok(examplePrompt.messages, 'Should have messages')

    const exampleMessage = examplePrompt.messages[0]
    assert.ok(
      exampleMessage.content.text.includes('TypeScript'),
      'Should include the topic'
    )
    assert.ok(
      exampleMessage.content.text.includes('advanced'),
      'Should include complexity level'
    )
    assert.ok(
      exampleMessage.content.text.includes('Examples'),
      'Should include examples section'
    )

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})

test('MCP Server - disableTool Tool', async () => {
  const client = new PikkuMCPTestClient(TEST_SERVER_COMMAND, TEST_SERVER_ARGS)

  try {
    await client.connect()

    // Test disabling a tool that exists
    const disableResult = await client.callTool('disableTool', {
      name: 'sayHello',
    })
    assert.ok(disableResult.content, 'Should have content')
    assert.ok(
      disableResult.content[0].text.includes('disabled') ||
        disableResult.content[0].text.includes('not enabled'),
      'Should indicate tool status change'
    )

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

    // This runs the comprehensive test built into the client
    await client.runFullTest()

    await client.disconnect()
  } catch (error) {
    await client.disconnect()
    throw error
  }
})
