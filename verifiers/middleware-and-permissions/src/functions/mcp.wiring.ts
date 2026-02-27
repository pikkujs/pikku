import {
  wireMCPResource,
  wireMCPPrompt,
  addMiddleware,
  addPermission,
  pikkuPermission,
  pikkuFunc,
  pikkuMCPToolFunc,
} from '#pikku'
import { wireMiddleware } from '../middleware/wire.js'
import { tagMiddleware } from '../middleware/tag.js'
import { functionMiddleware } from '../middleware/function.js'
import { functionPermission } from '../permissions/function.js'
import type { MCPResourceResponse, MCPPromptResponse } from '@pikku/core'

export const mcpTagMiddleware = () =>
  addMiddleware('mcp', [tagMiddleware('mcp')])

export const mcpTagPermissions = () =>
  addPermission('mcp', {
    mcpPermission: pikkuPermission(async ({ logger }, _data, { session }) => {
      logger.info({
        type: 'tag-permission',
        name: 'mcp',
        sessionExists: !!session,
      })
      return false
    }),
  })

export const mcpWirePermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    logger.info({
      type: 'wire-permission',
      name: 'mcp-wire',
      sessionExists: !!session,
    })
    return false
  }
)

export const functionTagMiddleware = () =>
  addMiddleware('function', [tagMiddleware('function')])

export { sessionTagMiddleware } from '../middleware/fake-session.js'

export const mcpToolFunction = pikkuMCPToolFunc<void>({
  description: 'Test MCP tool',
  tags: ['function', 'session', 'mcp'],
  middleware: [functionMiddleware('noOp'), wireMiddleware('mcp')],
  permissions: {
    functionLevel: functionPermission,
    wire: [mcpWirePermission],
  },
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'mcpTool', phase: 'execute' })
    return [{ type: 'text', text: 'MCP tool executed successfully' }]
  },
})

const mcpResourceFunction = pikkuFunc<void, MCPResourceResponse>({
  func: async ({ logger }, _, { mcp }) => {
    logger.info({ type: 'function', name: 'mcpResource', phase: 'execute' })
    return [{ uri: mcp!.uri!, text: 'MCP resource executed successfully' }]
  },
  middleware: [functionMiddleware('noOp')],
  permissions: {
    functionLevel: functionPermission,
  },
  tags: ['function'],
  auth: false,
})

wireMCPResource({
  uri: 'test-resource',
  title: 'Test Resource',
  description: 'Test MCP resource',
  tags: ['session', 'mcp'],
  middleware: [wireMiddleware('mcp')],
  permissions: { wire: [mcpWirePermission] },
  func: mcpResourceFunction,
})

const mcpPromptFunction = pikkuFunc<void, MCPPromptResponse>({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'mcpPrompt', phase: 'execute' })
    return [
      {
        role: 'user',
        content: { type: 'text', text: 'MCP prompt executed successfully' },
      },
    ]
  },
  middleware: [functionMiddleware('noOp')],
  permissions: {
    functionLevel: functionPermission,
  },
  tags: ['function'],
  auth: false,
})

wireMCPPrompt({
  name: 'test-prompt',
  description: 'Test MCP prompt',
  tags: ['session', 'mcp'],
  middleware: [wireMiddleware('mcp')],
  permissions: { wire: [mcpWirePermission] },
  func: mcpPromptFunction,
})
