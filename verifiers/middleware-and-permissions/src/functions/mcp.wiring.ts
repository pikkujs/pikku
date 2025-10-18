import {
  wireMCPTool,
  addMiddleware,
  addPermission,
  pikkuPermission,
} from '../../.pikku/pikku-types.gen.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

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

wireMCPTool({
  name: 'test-tool',
  description: 'Test MCP tool',
  tags: ['mcp'],
  middleware: [wireMiddleware('mcp')],
  permissions: [mcpWirePermission],
  func: noOpFunction,
})
