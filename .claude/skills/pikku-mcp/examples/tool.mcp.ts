import { wireMCPTool } from './pikku-types.gen.js'
import { annotateFile } from './functions/code-ops.function.js'

/**
 * MCP Tool wiring
 * Wire the annotateFile function defined in ./functions/code-ops.function.ts
 */
wireMCPTool({
  name: 'annotateFile',
  description: 'Add an annotation to a code file',
  func: annotateFile,
  tags: ['code', 'annotation'],
})
