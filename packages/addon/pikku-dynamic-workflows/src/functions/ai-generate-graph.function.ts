import { pikkuSessionlessFunc } from '#pikku'
import { callClaude, extractJson } from '../utils/claude.js'

const GRAPH_FORMAT_REFERENCE = `## Graph Format

The graph is a JSON object where keys are node IDs and values are node configs.

**Node:** \`{ rpcName, input?, next?, onError? }\`

**Data wiring (input field values):**
- \`{"$ref": "trigger", "path": "fieldName"}\` — extract field from workflow trigger input
- \`{"$ref": "nodeId", "path": "fieldName"}\` — extract field from a previous node's output
- Static values passed directly: \`{"count": 10}\`

**Flow control (next):**
- \`"next": "b"\` — sequential
- \`"next": ["b", "c"]\` — parallel fan-out
- Omit \`next\` for terminal nodes. Entry nodes are auto-detected.

**Error handling:**
- \`"onError": "handler"\` — route to error handler on failure

### Example: Sequential
{"double": {"rpcName": "doubleValue", "input": {"value": {"$ref": "trigger", "path": "value"}}, "next": "format"}, "format": {"rpcName": "formatMessage", "input": {"greeting": "Hello", "name": {"$ref": "trigger", "path": "name"}}}}

### Example: Parallel
{"fetchA": {"rpcName": "getA", "input": {}, "next": "combine"}, "fetchB": {"rpcName": "getB", "input": {}, "next": "combine"}, "combine": {"rpcName": "merge", "input": {"a": {"$ref": "fetchA", "path": "data"}, "b": {"$ref": "fetchB", "path": "data"}}}}`

export const aiGenerateGraph = pikkuSessionlessFunc<
  { prompt: string; schemas: string; previousError?: string },
  {
    nodes: Record<string, any>
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  description:
    'Uses AI to generate a workflow graph from a prompt and function schemas',
  func: async ({}, { prompt, schemas, previousError }) => {
    let claudePrompt = `You are generating a workflow graph in JSON format.

User request: "${prompt}"

${GRAPH_FORMAT_REFERENCE}

## Available Functions and Their Schemas

${schemas}

Generate a valid workflow graph as a JSON object. Use the function names exactly as listed above for rpcName values. Wire inputs using $ref and path to connect outputs from previous nodes. Return ONLY the JSON object, no explanation.`

    if (previousError) {
      claudePrompt += `\n\n## Previous Attempt Failed With These Errors\n\n${previousError}\n\nFix these errors in your new graph.`
    }

    const result = callClaude(claudePrompt)
    const nodes = extractJson(result.text) ?? {}

    return {
      nodes,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    }
  },
})
