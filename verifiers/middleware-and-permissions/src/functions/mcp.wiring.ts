import {
  wireMCPTool,
  addMiddleware,
  addPermission,
  pikkuPermission,
  pikkuFunc,
} from '../../.pikku/pikku-types.gen.js'
import { wireMiddleware } from '../middleware/wire.js'
import { tagMiddleware } from '../middleware/tag.js'
import { functionMiddleware } from '../middleware/function.js'
import { functionPermission } from '../permissions/function.js'
import { MCPToolResponse } from '@pikku/core'

// Tag middleware for MCP
export const mcpTagMiddleware = () =>
  addMiddleware('mcp', [tagMiddleware('mcp')])

// Tag permissions for MCP
export const mcpTagPermissions = () =>
  addPermission('mcp', {
    mcpPermission: pikkuPermission(async ({ logger }, _data, session) => {
      logger.info({
        type: 'tag-permission',
        name: 'mcp',
        sessionExists: !!session,
      })
      // Return false to ensure all permissions run
      return false
    }),
  })

// MCP wire-level permission (exported to be tree-shakeable)
export const mcpWirePermission = pikkuPermission(
  async ({ logger }, _data, session) => {
    logger.info({
      type: 'wire-permission',
      name: 'mcp-wire',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)

// Tag middleware for function tag
export const functionTagMiddleware = () =>
  addMiddleware('function', [tagMiddleware('function')])

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

// MCP-specific function that returns MCPToolResponse
const mcpToolFunction = pikkuFunc<void, MCPToolResponse>({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'mcpTool', phase: 'execute' })
    return [{ type: 'text', text: 'MCP tool executed successfully' }]
  },
  middleware: [functionMiddleware('noOp')],
  permissions: {
    functionLevel: functionPermission,
  },
  tags: ['function'],
  auth: false,
})

wireMCPTool({
  name: 'test-tool',
  description: 'Test MCP tool',
  tags: ['session', 'mcp'],
  middleware: [wireMiddleware('mcp')],
  permissions: { wire: [mcpWirePermission] },
  func: mcpToolFunction,
})
