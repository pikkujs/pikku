import type { AIAgentToolDef } from './ai-agent.types.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { canonicalJSON, hashString } from '../../utils/hash.js'
import type { WorkflowRuntimeMeta } from '../workflow/workflow.types.js'
import { runWorkflowGraph } from '../workflow/graph/graph-runner.js'
import type { StreamContext } from './ai-agent-prepare.js'
import type { PikkuWire, CoreUserSession } from '../../types/core.types.js'
import { ContextAwareRPCService, resolveNamespace } from '../rpc/rpc-runner.js'
import { createMiddlewareSessionWireProps } from '../../services/user-session-service.js'
import type { SessionService } from '../../services/user-session-service.js'
import {
  validateWorkflowWiring,
  computeEntryNodeIds,
} from '../workflow/graph/graph-validation.js'

function formatSchemaType(schema: any, depth = 0): string {
  if (!schema) return 'any'
  if (schema.enum)
    return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ')
  if (schema.type === 'array') {
    const itemType = schema.items
      ? formatSchemaType(schema.items, depth + 1)
      : 'any'
    return `${itemType}[]`
  }
  if (schema.type === 'object' && schema.properties) {
    if (depth > 1) return 'object'
    const fields = Object.entries(schema.properties)
      .map(([k, v]: [string, any]) => `${k}: ${formatSchemaType(v, depth + 1)}`)
      .join(', ')
    return `{${fields}}`
  }
  return schema.type || 'any'
}

function collectOutputPaths(schema: any, prefix = ''): string[] {
  if (!schema?.properties) return []
  const paths: string[] = []
  for (const [key, prop] of Object.entries(schema.properties) as [
    string,
    any,
  ][]) {
    const path = prefix ? `${prefix}.${key}` : key
    const type = prop.type || 'any'
    if (prop.type === 'object' && prop.properties) {
      paths.push(...collectOutputPaths(prop, path))
    } else {
      paths.push(`${path}: ${type}`)
    }
  }
  return paths
}

export function buildDynamicWorkflowInstructions(
  tools: string[],
  mode: 'read' | 'always' | 'ask'
): string {
  if (mode === 'read') {
    return (
      '\n\n## Existing Workflows\n\n' +
      'You can list and execute previously saved workflows using listAgentWorkflows and executeAgentWorkflow.\n' +
      "Use listAgentWorkflows to discover what's available, then executeAgentWorkflow to run them."
    )
  }

  const modeGuidance =
    mode === 'always'
      ? 'When a user requests a complex multi-step task, prefer creating a workflow over making sequential tool calls.\n' +
        'Check if a suitable workflow already exists with listAgentWorkflows first.\n' +
        'If none exists, create one with createAgentWorkflow, save with saveAgentWorkflow, then execute.\n\n'
      : 'When you receive a request that would benefit from a reusable multi-step workflow,\n' +
        'suggest creating one to the user. Explain the benefits (reusability, reliability,\n' +
        'can run in background) and wait for confirmation before creating.\n' +
        'Do NOT create workflows automatically — always propose and get user approval first.\n' +
        'For one-off tasks, just use the tools directly.\n\n'

  const toolSchemaLines: string[] = []

  for (const toolName of tools) {
    let fnMeta: any
    let schemas: Map<string, any>

    const resolved = toolName.includes(':') ? resolveNamespace(toolName) : null

    if (resolved) {
      fnMeta = pikkuState(resolved.package, 'function', 'meta')[
        resolved.function
      ]
      schemas = pikkuState(resolved.package, 'misc', 'schemas')
    } else {
      const rpcMeta = pikkuState(null, 'rpc', 'meta')
      const pikkuFuncId = rpcMeta[toolName]
      if (!pikkuFuncId) continue
      fnMeta = pikkuState(null, 'function', 'meta')[pikkuFuncId]
      schemas = pikkuState(null, 'misc', 'schemas')
    }

    if (!fnMeta) continue

    const inputSchema = fnMeta.inputSchemaName
      ? schemas.get(fnMeta.inputSchemaName)
      : null
    const outputSchema = fnMeta.outputSchemaName
      ? schemas.get(fnMeta.outputSchemaName)
      : null

    const toolDescription = fnMeta.description || fnMeta.title || ''
    const inputProps = inputSchema?.properties
      ? Object.entries(inputSchema.properties)
          .map(
            ([k, v]: [string, any]) =>
              `${k}${inputSchema.required?.includes(k) ? '' : '?'}: ${formatSchemaType(v)}`
          )
          .join(', ')
      : ''
    const outputProps = outputSchema?.properties
      ? Object.entries(outputSchema.properties)
          .map(([k, v]: [string, any]) => `${k}: ${formatSchemaType(v)}`)
          .join(', ')
      : 'any'

    const outputPaths = outputSchema ? collectOutputPaths(outputSchema) : []
    const outputPathsStr =
      outputPaths.length > 0
        ? `\n  output paths: ${outputPaths.join(', ')}`
        : ''

    toolSchemaLines.push(
      `- \`${toolName}\` — ${toolDescription || 'no description'}\n  input: {${inputProps}}\n  output: {${outputProps}}${outputPathsStr}`
    )
  }

  const sections: string[] = [
    '\n\n## Workflow Creation\n',
    modeGuidance,

    '### When to Create a Workflow\n' +
      'Create a workflow when:\n' +
      '- The task has 2+ steps with data dependencies between them\n' +
      '- The task will be repeated (workflows are reusable)\n' +
      '- Steps can fail independently and need error handling\n' +
      '- Steps can run in parallel for better performance\n' +
      'Do NOT create a workflow for single tool calls — just call the tool directly.\n',

    '### Process\n' +
      '1. Check if a suitable workflow exists: `listAgentWorkflows`\n' +
      '2. If the request is too vague to build a reliable workflow, ask the user to be more specific. For example, if a user says "make a workflow that does stuff with my data" — ask them what steps they need and what data flows between them.\n' +
      '3. Plan the graph: identify steps, dependencies, parallel paths, and failure modes\n' +
      '4. Create and validate: `createAgentWorkflow` — if validation fails, fix the errors and retry\n' +
      '5. Present the workflow to the user and get approval\n' +
      '6. Activate: `saveAgentWorkflow`\n' +
      '7. Run: `executeAgentWorkflow`\n',

    '### Available Tools:\n' + toolSchemaLines.join('\n') + '\n',

    '### Graph Format Reference\n\n' +
      '**Node:** `{ rpcName, input?, next?, onError? }`\n\n' +
      '**Data wiring (input field values):**\n' +
      '- `{"$ref": "trigger", "path": "fieldName"}` — extract field from trigger input (ALWAYS include `path`)\n' +
      '- `{"$ref": "nodeId", "path": "fieldName"}` — extract field from a previous node\'s output (ALWAYS include `path`)\n' +
      '- `path` supports dot notation for nested fields — use the "output paths" listed above to find the correct path\n' +
      '- Example: if a tool\'s output paths show `todo.id: string`, use `{"$ref": "nodeId", "path": "todo.id"}`\n' +
      '- `{"$template": {"parts": ["Hello ", "!"], "expressions": [{"$ref": "trigger", "path": "name"}]}}` — string interpolation\n' +
      '- Static values passed directly: `{"count": 10}`\n\n' +
      '**Flow control (`next`):**\n' +
      '- `"next": "b"` — sequential\n' +
      '- `"next": ["b", "c"]` — parallel fan-out\n' +
      '- `"next": {"ok": "b", "fail": "c"}` — conditional branch (node calls `graph.branch("ok")` at runtime)\n' +
      '- Omit `next` for terminal nodes. Entry nodes are auto-detected.\n\n' +
      '**Error handling:**\n' +
      '- `"onError": "handler"` — route to error handler on failure\n' +
      '- Error handler receives `{ error: { message: string } }` as input\n' +
      '- Without `onError`, a node failure fails the entire workflow\n\n' +
      '**Sub-workflows:** if `rpcName` matches an existing workflow name, it runs as a child workflow with its own execution context.\n\n' +
      '**Trigger input:** the workflow receives input when executed. Entry nodes extract fields via `$ref: "trigger"`. Document what fields your workflow expects in the `description`.\n',

    '### Design Principles\n' +
      '1. **Map dependencies first** — before writing nodes, identify which steps depend on which outputs\n' +
      '2. **Parallelize independent work** — steps with no data dependency should fan out via array `next`\n' +
      '3. **Add error handlers for external calls** — any node calling an external service should have `onError`\n' +
      "4. **Minimize blast radius** — isolate risky nodes so their failure doesn't cascade\n" +
      '5. **Name nodes by intent** — `fetchUsers`, `sendAlert` not `step1`, `step2`\n' +
      '6. **Keep graphs shallow** — prefer wide parallel graphs over deep sequential chains when possible\n',

    '### Common Mistakes\n' +
      '- `{"$ref": "trigger"}` without `path` — passes entire object, use `{"$ref": "trigger", "path": "field"}`\n' +
      '- Wrong path depth: if output paths show `todo.id`, use `"path": "todo.id"` not `"path": "id"`\n' +
      '- Type mismatch: wiring a string output to a number input\n' +
      '- Dangling `onError`/`next` references to nodes not in the graph\n' +
      '- Cycles: if A→B→A, there are no entry nodes\n',

    '### Examples\n\n' +
      '**Sequential with nested output path (if addTodo output paths show `todo.id`):**\n' +
      '```json\n{"add":{"rpcName":"addTodo","input":{"title":{"$ref":"trigger","path":"title"}},"next":"complete"},"complete":{"rpcName":"completeTodo","input":{"id":{"$ref":"add","path":"todo.id"}}}}\n```\n\n' +
      '**Error handling:**\n' +
      '```json\n{"deploy":{"rpcName":"deploy","input":{"env":{"$ref":"trigger","path":"env"}},"next":"notify","onError":"rollback"},"notify":{"rpcName":"alert","input":{"message":"Deployed"}},"rollback":{"rpcName":"rollback","input":{},"next":"alertFail"},"alertFail":{"rpcName":"alert","input":{"message":"Rolled back"}}}\n```\n\n' +
      '**Parallel fan-out:**\n' +
      '```json\n{"fetchA":{"rpcName":"getA","input":{},"next":"combine"},"fetchB":{"rpcName":"getB","input":{},"next":"combine"},"combine":{"rpcName":"graph:merge","input":{"items":[{"$ref":"fetchA","path":"data"},{"$ref":"fetchB","path":"data"}]}}}\n```',
  ]

  return sections.join('\n')
}

export function buildWorkflowTools(
  agentName: string,
  packageName: string | null,
  toolNames: string[],
  mode: 'read' | 'always' | 'ask',
  streamContext?: StreamContext,
  sessionService?: SessionService<CoreUserSession>
): AIAgentToolDef[] {
  const tools: AIAgentToolDef[] = []

  if (mode !== 'read') {
    tools.push({
      name: 'createAgentWorkflow',
      description:
        'Validate and create a draft workflow DAG that chains tools together. The graph is validated for wiring correctness and type compatibility. Call saveAgentWorkflow to activate it after the user approves.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Short name for the workflow (will be prefixed with ai:{agentName}:)',
          },
          description: {
            type: 'string',
            description: 'What this workflow does',
          },
          nodes: {
            type: 'string',
            description:
              'JSON string of nodeId→node map. Node fields: rpcName (tool name), input (use $ref+path to wire data), next (flow control), onError (error routing). Must have 2+ nodes.',
          },
        },
        required: ['name', 'nodes'],
      },
      execute: async (input: unknown) => {
        const raw = input as {
          name: string
          description?: string
          nodes: string | Record<string, any>
        }
        const name = raw.name.replace(/[^a-zA-Z0-9_-]/g, '-')
        let nodes: Record<string, any>
        if (typeof raw.nodes === 'string') {
          try {
            nodes = JSON.parse(raw.nodes)
          } catch {
            return { error: 'Invalid JSON in nodes field' }
          }
        } else {
          nodes = raw.nodes
        }

        if (Object.keys(nodes).length < 2) {
          return {
            error:
              'A workflow must have at least 2 nodes. A single node is just a tool call — use the tool directly instead.',
          }
        }

        const validationErrors = validateWorkflowWiring(nodes, toolNames)
        if (validationErrors.length > 0) {
          return {
            error: 'Workflow validation failed',
            errors: validationErrors,
          }
        }

        const entryNodeIds = computeEntryNodeIds(nodes)
        if (entryNodeIds.length === 0) {
          return {
            error:
              'No entry nodes found. Every node is referenced by another node, creating a cycle.',
          }
        }

        const fullName = `ai:${agentName}:${name}`

        const graphHash = hashString(canonicalJSON({ nodes, entryNodeIds }))
        const graph: WorkflowRuntimeMeta = {
          name: fullName,
          pikkuFuncId: fullName,
          source: 'ai-agent',
          description: raw.description,
          nodes,
          entryNodeIds,
          graphHash,
        }

        const singletonServices = getSingletonServices()
        if (!singletonServices?.workflowService) {
          return { error: 'Workflow service not available' }
        }

        await singletonServices.workflowService.upsertWorkflowVersion(
          fullName,
          graphHash,
          graph,
          'ai-agent',
          'draft'
        )

        return {
          valid: true,
          workflowName: fullName,
          graphHash,
          entryNodes: entryNodeIds,
          nodeCount: Object.keys(nodes).length,
          message: `Workflow '${fullName}' validated and saved as draft. Present this to the user and call saveAgentWorkflow to activate it.`,
        }
      },
    })

    tools.push({
      name: 'saveAgentWorkflow',
      description:
        'Activate a previously created draft workflow so it can be executed. Requires user approval.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Full workflow name returned by createAgentWorkflow (e.g. ai:agentName:myWorkflow)',
          },
          graphHash: {
            type: 'string',
            description: 'Graph hash returned by createAgentWorkflow',
          },
        },
        required: ['name', 'graphHash'],
      },
      needsApproval: true,
      approvalDescriptionFn: async (input: unknown) => {
        const raw = input as { name: string; graphHash: string }
        const fullName = raw.name.startsWith(`ai:${agentName}:`)
          ? raw.name
          : `ai:${agentName}:${raw.name}`

        const singletonServices = getSingletonServices()
        if (!singletonServices?.workflowService) {
          return `Activate workflow '${fullName}'`
        }

        const version =
          await singletonServices.workflowService.getWorkflowVersion(
            fullName,
            raw.graphHash
          )
        if (version) {
          const graph = version.graph as WorkflowRuntimeMeta
          if (graph.nodes) {
            const desc = graph.description ? `\n${graph.description}` : ''
            return `Activate workflow '${fullName}' (${Object.keys(graph.nodes).length} nodes)${desc}`
          }
        }
        return `Activate workflow '${fullName}'`
      },
      execute: async (input: unknown) => {
        const raw = input as { name: string; graphHash: string }
        const fullName = raw.name.startsWith(`ai:${agentName}:`)
          ? raw.name
          : `ai:${agentName}:${raw.name}`

        const singletonServices = getSingletonServices()
        if (!singletonServices?.workflowService) {
          return { error: 'Workflow service not available' }
        }

        const version =
          await singletonServices.workflowService.getWorkflowVersion(
            fullName,
            raw.graphHash
          )
        if (!version) {
          return {
            error: `Workflow '${fullName}' with hash '${raw.graphHash}' not found. Use createAgentWorkflow first.`,
          }
        }

        await singletonServices.workflowService.updateWorkflowVersionStatus(
          fullName,
          raw.graphHash,
          'active'
        )

        const graph = version.graph as WorkflowRuntimeMeta
        const allMeta = pikkuState(null, 'workflows', 'meta')
        allMeta[fullName] = graph

        if (streamContext) {
          streamContext.channel.send({
            type: 'workflow-created',
            workflowName: fullName,
            graph,
          })
        }

        return {
          success: true,
          workflowName: fullName,
          message: `Workflow '${fullName}' activated and ready to execute.`,
        }
      },
    })
  } // end if (mode !== 'read')

  tools.push({
    name: 'listAgentWorkflows',
    description:
      'List previously saved workflows for this agent that can be executed.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const singletonServices = getSingletonServices()
      if (!singletonServices?.workflowService) {
        return { error: 'Workflow service not available' }
      }

      const results: Array<{
        name: string
        description?: string
        graphHash?: string
      }> = []

      const allMeta = pikkuState(null, 'workflows', 'meta')
      const prefix = `ai:${agentName}:`
      for (const [name, meta] of Object.entries(allMeta)) {
        if (name.startsWith(prefix) && meta.source === 'ai-agent') {
          results.push({
            name,
            description: meta.description,
            graphHash: meta.graphHash,
          })
        }
      }

      if (results.length === 0) {
        const persisted =
          await singletonServices.workflowService.getAIGeneratedWorkflows(
            agentName
          )
        for (const wf of persisted) {
          results.push({
            name: wf.workflowName,
            graphHash: wf.graphHash,
          })
        }
      }

      return { workflows: results }
    },
  })

  tools.push({
    name: 'executeAgentWorkflow',
    description: 'Execute a previously saved workflow with the given input.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Workflow name (will be auto-prefixed with ai:{agentName}: if needed)',
        },
        input: {
          type: 'object',
          description: 'Input data for the workflow trigger',
        },
      },
      required: ['name'],
    },
    needsApproval: true,
    approvalDescriptionFn: async (input: unknown) => {
      const { name, input: workflowInput } = input as {
        name: string
        input?: Record<string, any>
      }
      const fullName = name.startsWith(`ai:${agentName}:`)
        ? name
        : `ai:${agentName}:${name}`
      const inputStr = workflowInput
        ? `\nInput: ${JSON.stringify(workflowInput)}`
        : ''
      return `Execute workflow '${fullName}'${inputStr}`
    },
    execute: async (toolInput: unknown) => {
      const { name, input: workflowInput } = toolInput as {
        name: string
        input?: Record<string, any>
      }

      const fullName = name.startsWith(`ai:${agentName}:`)
        ? name
        : `ai:${agentName}:${name}`

      const singletonServices = getSingletonServices()
      if (!singletonServices?.workflowService) {
        return { error: 'Workflow service not available' }
      }

      const allMeta = pikkuState(null, 'workflows', 'meta')
      if (!allMeta[fullName]) {
        return {
          error: `Workflow '${fullName}' not found. Use listAgentWorkflows to see available workflows, or createAgentWorkflow to make a new one.`,
        }
      }

      const workflowService = singletonServices.workflowService as any

      const wire: PikkuWire = sessionService
        ? { ...createMiddlewareSessionWireProps(sessionService) }
        : {}
      const rpcService = new ContextAwareRPCService(singletonServices, wire, {
        sessionService,
      })

      const { runId } = await runWorkflowGraph(
        workflowService,
        fullName,
        workflowInput ?? {},
        rpcService,
        true,
        undefined,
        { type: 'ai-agent' }
      )

      const maxWait = 45000
      const startTime = Date.now()
      let pollInterval = 100
      while (Date.now() - startTime < maxWait) {
        const run = await workflowService.getRun(runId)
        if (!run) {
          return { error: `Workflow run '${runId}' not found` }
        }
        if (
          run.status === 'completed' ||
          run.status === 'failed' ||
          run.status === 'cancelled' ||
          run.status === 'suspended'
        ) {
          if (run.status === 'failed') {
            return {
              error: `Workflow failed: ${run.error?.message || 'Unknown error'}`,
              runId,
            }
          }
          return { result: run.output, runId, status: run.status }
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
        pollInterval = Math.min(pollInterval * 1.5, 2000)
      }

      return {
        runId,
        status: 'running',
        message:
          'Workflow is still running after timeout. It will continue in the background.',
      }
    },
  })

  return tools
}
