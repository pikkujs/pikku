import {
  wireMCPTool,
  addMiddleware,
  pikkuSessionlessFunc,
} from '../../.pikku/pikku-types.gen.js'
import { globalMiddleware } from '../middleware/global.js'
import { wireMiddleware } from '../middleware/wire.js'
import { functionMiddleware } from '../middleware/function.js'

// Tag middleware for MCP
export const mcpTagMiddleware = () => addMiddleware('mcp', [globalMiddleware])

const mcpNoOpFunction = pikkuSessionlessFunc({
  func: async ({ logger }, _data) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'execute' })
    return { success: true }
  },
  middleware: [functionMiddleware],
})

wireMCPTool({
  name: 'testTool',
  description: 'A test MCP tool',
  tags: ['mcp'],
  middleware: [wireMiddleware],
  func: mcpNoOpFunction,
})
