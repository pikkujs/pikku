/**
 * Type constraint: MCP wirings must have required properties
 *
 * Tools, resources, and prompts each have specific required properties.
 */

import {
  wireMCPTool,
  wireMCPResource,
  wireMCPPrompt,
  pikkuMCPToolFunc,
  pikkuMCPResourceFunc,
  pikkuMCPPromptFunc,
} from '../../.pikku/pikku-types.gen.js'

const toolFunc = pikkuMCPToolFunc<unknown>(async () => [
  { type: 'text', text: 'result' },
])
const resourceFunc = pikkuMCPResourceFunc<unknown>(async ({ mcp }, {}) => [
  { uri: mcp.uri!, text: 'data' },
])
const promptFunc = pikkuMCPPromptFunc<unknown>(async () => [
  { role: 'user', content: { type: 'text', text: 'prompt' } },
])

// Valid: Tool with all required properties
wireMCPTool({
  name: 'validTool',
  description: 'A valid tool',
  func: toolFunc,
})

// @ts-expect-error - Tool missing 'name' property
wireMCPTool({
  description: 'Tool without name',
  func: toolFunc,
})

// @ts-expect-error - Tool missing 'description' property
wireMCPTool({
  name: 'noDescTool',
  func: toolFunc,
})

// @ts-expect-error - Tool missing 'func' property
wireMCPTool({
  name: 'noFuncTool',
  description: 'Tool without func',
})

// Valid: Resource with all required properties
wireMCPResource({
  uri: 'resource-uri',
  title: 'Resource Title',
  description: 'A valid resource',
  func: resourceFunc,
})

// @ts-expect-error - Resource missing 'uri' property
wireMCPResource({
  title: 'No URI',
  description: 'Resource without URI',
  func: resourceFunc,
})

// @ts-expect-error - Resource missing 'title' property
wireMCPResource({
  uri: 'no-title',
  description: 'Resource without title',
  func: resourceFunc,
})

// @ts-expect-error - Resource missing 'description' property
wireMCPResource({
  uri: 'no-desc',
  title: 'No Description',
  func: resourceFunc,
})

// @ts-expect-error - Resource missing 'func' property
wireMCPResource({
  uri: 'no-func',
  title: 'No Function',
  description: 'Resource without func',
})

// Valid: Prompt with all required properties
wireMCPPrompt({
  name: 'validPrompt',
  description: 'A valid prompt',
  func: promptFunc,
})

// @ts-expect-error - Prompt missing 'name' property
wireMCPPrompt({
  description: 'Prompt without name',
  func: promptFunc,
})

// @ts-expect-error - Prompt missing 'description' property
wireMCPPrompt({
  name: 'noDescPrompt',
  func: promptFunc,
})

// @ts-expect-error - Prompt missing 'func' property
wireMCPPrompt({
  name: 'noFuncPrompt',
  description: 'Prompt without func',
})

// Valid: Tool with optional tags
wireMCPTool({
  name: 'taggedTool',
  description: 'Tool with tags',
  func: toolFunc,
  tags: ['tag1', 'tag2'],
})

wireMCPTool({
  name: 'invalidTags',
  description: 'Tool with invalid tags',
  func: toolFunc,
  // @ts-expect-error - Tags must be array of strings
  tags: 'not-an-array',
})

// Valid: Resource with optional tags
wireMCPResource({
  uri: 'tagged-resource',
  title: 'Tagged Resource',
  description: 'Resource with tags',
  func: resourceFunc,
  tags: ['data', 'api'],
})

wireMCPTool({
  // @ts-expect-error - Name must be string
  name: 123,
  description: 'Invalid name type',
  func: toolFunc,
})

wireMCPPrompt({
  name: 'invalidDesc',
  // @ts-expect-error - Description must be string
  description: 123,
  func: promptFunc,
})
