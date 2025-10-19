import { wireMCPResource } from './pikku-types.gen.js'
import { codeSearch } from './functions/code-search.function.js'

/**
 * MCP Resource wiring
 * Wire the codeSearch function defined in ./functions/code-search.function.ts
 */
wireMCPResource({
  name: 'codeSearch',
  description: 'Search through the codebase',
  func: codeSearch,
  tags: ['code', 'search'],
})
