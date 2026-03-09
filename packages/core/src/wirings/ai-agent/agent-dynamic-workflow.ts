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

export function buildDynamicWorkflowInstructions(tools: string[], mode: 'read' | 'always' | 'ask'): string {
  if (mode === 'read') {
    return (
      '\n\n## Existing Workflows\n\n' +
      'You can list and execute previously saved workflows using listAgentWorkflows and executeAgentWorkflow.\n' +
      'Use listAgentWorkflows to discover what\'s available, then executeAgentWorkflow to run them.'
    )
  }

  const modeGuidance = mode === 'always'
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
              `${k}${inputSchema.required?.includes(k) ? '' : '?'}: ${v.type || 'any'}`
          )
          .join(', ')
      : ''
    const outputProps = outputSchema?.properties
      ? Object.entries(outputSchema.properties)
          .map(([k, v]: [string, any]) => `${k}: ${v.type || 'any'}`)
          .join(', ')
      : 'any'

    toolSchemaLines.push(
      `- ${toolName}(input: {${inputProps}}) → {${outputProps}}${toolDescription ? ` — ${toolDescription}` : ''}`
    )
  }

  return (
    '\n\n## Workflow Creation\n\n' +
    modeGuidance +
    'You can create workflows that chain your tools together. Use createAgentWorkflow to validate and preview a workflow, then saveAgentWorkflow to save it, then executeAgentWorkflow to run it.\n\n' +
    '### Tool Schemas:\n' +
    toolSchemaLines.join('\n') +
    '\n\n### Workflow Format:\n' +
    '- Each node has: rpcName (tool name), input (with $ref to wire outputs), next (flow control), onError\n' +
    '- Use {"$ref": "nodeId", "path": "fieldName"} to wire a previous node\'s output field to this node\'s input\n' +
    '- Use {"$ref": "trigger", "path": "fieldName"} to extract a field from the workflow\'s trigger input. IMPORTANT: Always include "path" — never pass {"$ref": "trigger"} without "path", or the entire trigger object will be used as the value.\n' +
    '- Use {"$ref": "nodeId", "path": "fieldName"} to extract a field from a previous node\'s output. Always include "path" to select the specific field.\n' +
    '- next can be a string (single next node), array (parallel), or object {branchKey: nextNode} for branching\n' +
    '\n### Example (add todo from trigger title, then list):\n' +
    '{"add":{"rpcName":"todos:addTodo","input":{"title":{"$ref":"trigger","path":"title"}},"next":"list"},"list":{"rpcName":"todos:listTodos","input":{}}}\n' +
    '\n### Example (add todo, sleep, complete using addTodo result id):\n' +
    '{"add":{"rpcName":"todos:addTodo","input":{"title":{"$ref":"trigger","path":"title"}},"next":"wait"},"wait":{"rpcName":"sleep","input":{"seconds":5},"next":"complete"},"complete":{"rpcName":"todos:completeTodo","input":{"id":{"$ref":"add","path":"id"}}}}'
  )
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
      'Validate and create a draft workflow graph that chains tools together. Call saveAgentWorkflow to activate it after the user approves.',
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
            'JSON string of a map of nodeId to node config. Each node has: rpcName (tool name), input (with $ref to wire outputs), next (string|string[]|{branchKey: string}), onError (string|string[]). Example: {"list":{"rpcName":"todos:listTodos","input":{}}}',
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
