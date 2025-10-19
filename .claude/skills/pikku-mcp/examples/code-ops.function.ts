import { pikkuMCPToolFunc } from '#pikku/pikku-types.gen.js'
import type { MCPToolResponse } from '../pikku-types.gen.js'

/**
 * MCP Tool function
 * Tools are actions that AI models can invoke
 * CRITICAL: Always specify MCPToolResponse as output type
 */

type AnnotateFileInput = {
  file: string
  line: number
  note: string
}

export const annotateFile = pikkuMCPToolFunc<
  AnnotateFileInput,
  MCPToolResponse
>({
  docs: {
    summary: 'Add annotation to code file',
    description: 'Annotate a specific line in a code file',
    tags: ['mcp', 'code-ops'],
    errors: [],
  },
  // ✅ CORRECT: Destructure services
  func: async ({ rpc }, input) => {
    await rpc.invoke('annotateFile', input)

    // ✅ CORRECT: Return MCPToolResponse format
    return [
      {
        type: 'text',
        text: `Annotation added to ${input.file}:${input.line}`,
      },
    ]
  },
})
