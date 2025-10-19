import {
  wireMCPResource,
  wireMCPTool,
  wireMCPPrompt,
} from './pikku-types.gen.js'
import { codeSearch } from './functions/code-search.function.js'
import { annotateFile } from './functions/code-ops.function.js'
import { reviewPrompt } from './functions/review-prompt.function.js'

/**
 * Grouped MCP wiring
 * Wire multiple MCP functions in a single file
 */

// Resource binding
wireMCPResource({
  name: 'codeSearch',
  description: 'Search through the codebase',
  func: codeSearch,
  tags: ['code', 'search'],
})

// Tool binding
wireMCPTool({
  name: 'annotateFile',
  description: 'Add an annotation to a code file',
  func: annotateFile,
  tags: ['code', 'annotation'],
})

// Prompt binding
wireMCPPrompt({
  name: 'reviewCode',
  description: 'Generate a code review prompt template',
  func: reviewPrompt,
  tags: ['code', 'review'],
})
