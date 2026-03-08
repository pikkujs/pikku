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
  generateMermaidDiagram,
} from '../workflow/graph/graph-validation.js'

export function buildDynamicWorkflowInstructions(
  tools: string[],
  packageName: string | null
): string {
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
  streamContext?: StreamContext,
  sessionService?: SessionService<CoreUserSession>
): AIAgentToolDef[] {
  const tools: AIAgentToolDef[] = []
  const pendingWorkflows = new Map<
    string,
    { meta: WorkflowRuntimeMeta; mermaid: string }
  >()

  tools.push({
    name: 'createAgentWorkflow',
    description:
      'Validate and preview a workflow graph that chains tools together. Returns a preview with a mermaid diagram. Call saveAgentWorkflow to save it after the user approves.',
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
      const name = raw.name
      const description = raw.description
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

      const meta: WorkflowRuntimeMeta = {
        name: fullName,
        pikkuFuncId: fullName,
        source: 'ai-agent',
        description,
        nodes,
        entryNodeIds,
        graphHash,
      }

      const mermaid = generateMermaidDiagram(fullName, nodes, entryNodeIds)

      pendingWorkflows.set(fullName, { meta, mermaid })

      return {
        valid: true,
        workflowName: fullName,
        entryNodes: entryNodeIds,
        nodeCount: Object.keys(nodes).length,
        mermaid,
        message: `Workflow '${fullName}' validated with ${Object.keys(nodes).length} nodes. Present this to the user and call saveAgentWorkflow to save it.`,
      }
    },
  })

  tools.push({
    name: 'saveAgentWorkflow',
    description:
      'Save a previously validated workflow so it can be executed. Requires user approval. Always include the nodes JSON from createAgentWorkflow.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Full workflow name returned by createAgentWorkflow (e.g. ai:agentName:myWorkflow)',
        },
        nodes: {
          type: 'string',
          description:
            'JSON string of the workflow nodes (same as passed to createAgentWorkflow). Required for persistence.',
        },
        description: {
          type: 'string',
          description: 'What this workflow does',
        },
      },
      required: ['name', 'nodes'],
    },
    needsApproval: true,
    approvalDescriptionFn: async (input: unknown) => {
      const raw = input as {
        name: string
        nodes?: string
        description?: string
      }
      const fullName = raw.name.startsWith(`ai:${agentName}:`)
        ? raw.name
        : `ai:${agentName}:${raw.name}`
      const pending = pendingWorkflows.get(fullName)
      if (pending) {
        const nodeCount = Object.keys(pending.meta.nodes!).length
        const desc = pending.meta.description
          ? `\n${pending.meta.description}`
          : ''
        return `Save workflow '${fullName}' (${nodeCount} nodes)${desc}\n\n${pending.mermaid}`
      }
      if (raw.nodes) {
        try {
          const nodes =
            typeof raw.nodes === 'string' ? JSON.parse(raw.nodes) : raw.nodes
          const nodeCount = Object.keys(nodes).length
          const entryNodeIds = computeEntryNodeIds(nodes)
          const mermaid = generateMermaidDiagram(fullName, nodes, entryNodeIds)
          const desc = raw.description ? `\n${raw.description}` : ''
          return `Save workflow '${fullName}' (${nodeCount} nodes)${desc}\n\n${mermaid}`
        } catch {
          return `Save workflow '${fullName}'`
        }
      }
      return `Save workflow '${fullName}'`
    },
    execute: async (input: unknown) => {
      const raw = input as {
        name: string
        nodes?: string | Record<string, any>
        description?: string
      }
      const fullName = raw.name.startsWith(`ai:${agentName}:`)
        ? raw.name
        : `ai:${agentName}:${raw.name}`

      let meta: WorkflowRuntimeMeta
      const pending = pendingWorkflows.get(fullName)

      if (pending) {
        meta = pending.meta
        pendingWorkflows.delete(fullName)
      } else if (raw.nodes) {
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
          return { error: 'No entry nodes found.' }
        }

        const graphHash = hashString(canonicalJSON({ nodes, entryNodeIds }))
        meta = {
          name: fullName,
          pikkuFuncId: fullName,
          source: 'ai-agent',
          description: raw.description,
          nodes,
          entryNodeIds,
          graphHash,
        }
      } else {
        return {
          error: `No pending workflow '${fullName}' and no nodes provided. Include the nodes JSON from createAgentWorkflow.`,
        }
      }

      const allMeta = pikkuState(null, 'workflows', 'meta')
      allMeta[fullName] = meta

      const singletonServices = getSingletonServices()
      if (singletonServices?.workflowService) {
        await singletonServices.workflowService.upsertWorkflowVersion(
          fullName,
          meta.graphHash!,
          meta,
          'ai-agent'
        )
      }

      if (streamContext) {
        streamContext.channel.send({
          type: 'workflow-created',
          workflowName: fullName,
          nodes: meta.nodes!,
          entryNodeIds: meta.entryNodeIds!,
        })
      }

      return {
        success: true,
        workflowName: fullName,
        message: `Workflow '${fullName}' saved and ready to execute.`,
      }
    },
  })

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

      if (results.length === 0 && singletonServices?.workflowService) {
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

      const pollInterval = 200
      const maxWait = 45000
      let elapsed = 0
      while (elapsed < maxWait) {
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
        elapsed += pollInterval
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
