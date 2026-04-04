import { pikkuSessionlessFunc } from '#pikku'
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pikkuState } from '@pikku/core/internal'
import {
  validateWorkflowWiring,
  computeEntryNodeIds as computeEntryNodeIdsFromCore,
} from '@pikku/core/workflow'
import type { FunctionMeta } from '../services/wiring.service.js'

async function loadSchemas(metaDir: string): Promise<Record<string, any>> {
  const schemasDir = join(metaDir, 'schemas/schemas')
  const cache: Record<string, any> = {}
  try {
    const files = await readdir(schemasDir)
    for (const file of files) {
      if (file.endsWith('.schema.json')) {
        const name = file.replace('.schema.json', '')
        cache[name] = JSON.parse(
          await readFile(join(schemasDir, file), 'utf-8')
        )
      }
    }
  } catch {}
  return cache
}

function buildFunctionContext(
  functions: FunctionMeta[],
  schemas: Record<string, any>
): string {
  const lines: string[] = [
    '## Available Functions\n',
    '| Function | Description | Input fields | Output fields |',
    '|----------|-------------|-------------|---------------|',
  ]

  for (const fn of functions) {
    if ((fn as any).functionType !== 'user') continue
    if (fn.pikkuFuncId.startsWith('pikkuWorkflow')) continue
    if (fn.pikkuFuncId.startsWith('pikkuRemote')) continue
    if (fn.pikkuFuncId.startsWith('http:')) continue

    const inputSchema = fn.inputSchemaName ? schemas[fn.inputSchemaName] : null
    const outputSchema = fn.outputSchemaName
      ? schemas[fn.outputSchemaName]
      : null

    const desc = (fn as any).description || '-'
    const inputFields = inputSchema?.properties
      ? Object.entries(inputSchema.properties)
          .map(([k, v]: [string, any]) => `${k}: ${v.type || 'any'}`)
          .join(', ')
      : '-'
    const outputFields = outputSchema?.properties
      ? Object.entries(outputSchema.properties)
          .map(([k, v]: [string, any]) => `${k}: ${v.type || 'any'}`)
          .join(', ')
      : '-'

    lines.push(
      `| \`${fn.pikkuFuncId}\` | ${desc} | ${inputFields} | ${outputFields} |`
    )
  }

  return lines.join('\n')
}

const GRAPH_FORMAT = `## Graph Format

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
\`\`\`json
{
  "double": { "rpcName": "doubleValue", "input": { "value": { "$ref": "trigger", "path": "value" } }, "next": "format" },
  "format": { "rpcName": "formatMessage", "input": { "greeting": "Hello", "name": { "$ref": "trigger", "path": "name" } }, "next": "notify" },
  "notify": { "rpcName": "sendNotification", "input": { "to": { "$ref": "trigger", "path": "name" }, "body": { "$ref": "format", "path": "message" } } }
}
\`\`\`

### Example: Parallel
\`\`\`json
{
  "fetchA": { "rpcName": "getA", "input": {}, "next": "combine" },
  "fetchB": { "rpcName": "getB", "input": {}, "next": "combine" },
  "combine": { "rpcName": "merge", "input": { "a": { "$ref": "fetchA", "path": "data" }, "b": { "$ref": "fetchB", "path": "data" } } }
}
\`\`\`
`

interface ClaudeResult {
  text: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

function callClaude(prompt: string): ClaudeResult {
  const raw = execFileSync(
    'claude',
    ['-p', prompt, '--model', 'haiku', '--output-format', 'json'],
    {
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  ).toString()
  const json = JSON.parse(raw)
  return {
    text: json.result ?? '',
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    costUsd: json.total_cost_usd ?? 0,
  }
}

function extractJson(text: string): Record<string, any> | null {
  let clean = text.trim()
  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    clean = fenceMatch[1]!.trim()
  }
  const jsonMatch = clean.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
}

function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 12)
}

export const generateWorkflowGraph = pikkuSessionlessFunc<
  { prompt: string; workflowName: string },
  {
    success: boolean
    message: string
    workflowName: string
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  title: 'Generate Workflow Graph',
  description:
    'Uses AI to generate a workflow graph, validates it, and stores it via workflowService.',
  expose: true,
  auth: false,
  func: async ({ wiringService }, { prompt, workflowName }) => {
    const metaDir = pikkuState(null, 'package', 'metaDir') ?? ''
    if (!metaDir) {
      throw new Error('Only available in local development mode')
    }

    const allFunctions = Object.values(await wiringService.readFunctionsMeta())
    const schemas = await loadSchemas(metaDir)
    const functionContext = buildFunctionContext(allFunctions, schemas)

    const fullPrompt = `You are generating a Pikku workflow graph.

${functionContext}

${GRAPH_FORMAT}

## Rules
- Use ONLY functions listed above as rpcName values
- For addon functions, use the full namespaced name (e.g. 'todos:listTodos')
- Always include "path" when using $ref
- Node IDs should be descriptive camelCase names
- Must have at least 2 nodes
- Use static values for fields that are known at design time (e.g. "greeting": "Hello")
- Only use $ref for data that flows from the trigger input or a previous node's output
- Every $ref path must match an actual field in the trigger input or node output schema

## Task
Generate a workflow graph JSON for:

${prompt}

Respond with ONLY the JSON object. No markdown fences. No explanation.`

    let result: ClaudeResult
    try {
      result = callClaude(fullPrompt)
    } catch (e: any) {
      throw new Error(`AI generation failed: ${e.message}`)
    }

    const nodes = extractJson(result.text)
    if (!nodes) {
      throw new Error('AI did not return valid JSON')
    }

    if (Object.keys(nodes).length < 2) {
      throw new Error(
        'Workflow must have at least 2 nodes. Use a tool call directly for single operations.'
      )
    }

    const toolNames = allFunctions.map((f) => f.pikkuFuncId)
    const validationErrors = validateWorkflowWiring(nodes, toolNames)
    if (validationErrors.length > 0) {
      throw new Error(
        `Workflow validation failed:\n${validationErrors.join('\n')}`
      )
    }

    const entryNodeIds = computeEntryNodeIdsFromCore(nodes)
    if (entryNodeIds.length === 0) {
      throw new Error(
        'No entry nodes found — every node is referenced by another, creating a cycle.'
      )
    }

    const fullName = `console:${workflowName}`
    const graphHash = hashString(JSON.stringify({ nodes, entryNodeIds }))

    const graph = {
      name: fullName,
      pikkuFuncId: fullName,
      source: 'ai-agent',
      description: prompt,
      nodes,
      entryNodeIds,
      graphHash,
    }

    const singletonServices = pikkuState(null, 'package', 'singletonServices')
    if (!singletonServices?.workflowService) {
      throw new Error('Workflow service not available')
    }

    await singletonServices.workflowService.upsertWorkflowVersion(
      fullName,
      graphHash,
      graph,
      'ai-agent',
      'active'
    )

    return {
      success: true,
      message: `Workflow '${fullName}' generated and saved`,
      workflowName: fullName,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    }
  },
})
