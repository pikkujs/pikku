/**
 * Type constraint: MCP wirings must have required properties
 *
 * Resources and prompts each have specific required properties.
 * Tools now use pikkuMCPToolFunc with description instead of wireMCPTool.
 */

import {
  wireMCPResource,
  wireMCPPrompt,
  pikkuMCPToolFunc,
  pikkuMCPResourceFunc,
  pikkuMCPPromptFunc,
} from '#pikku'

export const toolFunc = pikkuMCPToolFunc<unknown>({
  description: 'A valid tool',
  func: async () => [{ type: 'text', text: 'result' }],
})
const resourceFunc = pikkuMCPResourceFunc<unknown>(async ({}, _, { mcp }) => [
  { uri: mcp.uri!, text: 'data' },
])
const promptFunc = pikkuMCPPromptFunc<unknown>(async () => [
  { role: 'user', content: { type: 'text', text: 'prompt' } },
])

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

// Valid: Resource with optional tags
wireMCPResource({
  uri: 'tagged-resource',
  title: 'Tagged Resource',
  description: 'Resource with tags',
  func: resourceFunc,
  tags: ['data', 'api'],
})

wireMCPPrompt({
  name: 'invalidDesc',
  // @ts-expect-error - Description must be string
  description: 123,
  func: promptFunc,
})
