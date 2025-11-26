/**
 * WorkflowGraph Scheduler
 * Executes cyclic graph-based workflows with support for:
 * - Branching via graph.branch()
 * - Parallel execution
 * - Cycle handling with iteration tracking
 * - Error routing via onError
 */

import type {
  WorkflowGraph,
  WorkflowGraphNodeInstance,
  GraphContext,
  NodeExecutionResult,
  WorkflowGraphRunState,
  WorkflowGraphExecutionOptions,
} from './workflow-graph.types.js'
import { resolveInputs, type PathResolverContext } from './path-resolver.js'

/**
 * Default maximum iterations per node instance
 */
const DEFAULT_MAX_ITERATIONS = 100

/**
 * Error thrown when max iterations exceeded
 */
export class MaxIterationsExceededError extends Error {
  constructor(instanceId: string, maxIterations: number) {
    super(
      `Instance '${instanceId}' exceeded maximum iterations (${maxIterations})`
    )
    this.name = 'MaxIterationsExceededError'
  }
}

/**
 * Error thrown when no trigger node is found
 */
export class NoTriggerNodeError extends Error {
  constructor() {
    super('WorkflowGraph must have at least one trigger node')
    this.name = 'NoTriggerNodeError'
  }
}

/**
 * Error thrown when a referenced node doesn't exist
 */
export class InvalidNodeReferenceError extends Error {
  constructor(instanceId: string, referenced: string) {
    super(
      `Instance '${instanceId}' references non-existent instance '${referenced}'`
    )
    this.name = 'InvalidNodeReferenceError'
  }
}

/**
 * Find all trigger nodes in a graph (nodes with no incoming edges)
 */
export function findTriggerNodes(graph: WorkflowGraph): string[] {
  // Build set of all instances that are referenced by 'next'
  const hasIncoming = new Set<string>()

  for (const instance of Object.values(graph)) {
    if (instance.next) {
      if (typeof instance.next === 'string') {
        hasIncoming.add(instance.next)
      } else if (Array.isArray(instance.next)) {
        for (const n of instance.next) {
          hasIncoming.add(n)
        }
      } else {
        // Record<string, string | string[]>
        for (const targets of Object.values(instance.next)) {
          if (typeof targets === 'string') {
            hasIncoming.add(targets)
          } else {
            for (const t of targets) {
              hasIncoming.add(t)
            }
          }
        }
      }
    }
    // Also check onError
    if (instance.onError) {
      if (typeof instance.onError === 'string') {
        hasIncoming.add(instance.onError)
      } else {
        for (const e of instance.onError) {
          hasIncoming.add(e)
        }
      }
    }
  }

  // Return instances that have no incoming edges
  return Object.keys(graph).filter((id) => !hasIncoming.has(id))
}

/**
 * Resolve the next instance(s) to execute based on the next configuration
 * and optional branch selection.
 */
export function resolveNextInstances(
  next: WorkflowGraphNodeInstance['next'],
  selectedBranch?: string
): string[] {
  if (!next) {
    return []
  }

  if (typeof next === 'string') {
    return [next]
  }

  if (Array.isArray(next)) {
    return next
  }

  // Record<string, string | string[]> - branching
  if (!selectedBranch) {
    throw new Error(
      'Branch selection required but no branch was selected by the node'
    )
  }

  const target = next[selectedBranch]
  if (!target) {
    throw new Error(
      `Branch '${selectedBranch}' not found in next configuration`
    )
  }

  if (typeof target === 'string') {
    return [target]
  }

  return target
}

/**
 * WorkflowGraph Scheduler class
 */
export class WorkflowGraphScheduler {
  private graph: WorkflowGraph
  private options: WorkflowGraphExecutionOptions
  private state: WorkflowGraphRunState
  private rpcService: any

  constructor(
    graph: WorkflowGraph,
    runId: string,
    input: unknown,
    rpcService: any,
    options: WorkflowGraphExecutionOptions = {}
  ) {
    this.graph = graph
    this.rpcService = rpcService
    this.options = options
    this.state = {
      runId,
      graph,
      iterations: new Map(),
      completed: new Map(),
      executing: new Set(),
      status: 'running',
      input,
    }
  }

  /**
   * Execute the workflow graph
   */
  async execute(): Promise<WorkflowGraphRunState> {
    // Find trigger nodes
    const triggerNodes = findTriggerNodes(this.graph)
    if (triggerNodes.length === 0) {
      throw new NoTriggerNodeError()
    }

    // Start with trigger nodes
    await this.executeInstances(triggerNodes)

    // Mark completed if no errors
    if (this.state.status === 'running') {
      this.state.status = 'completed'
    }

    return this.state
  }

  /**
   * Execute one or more instances (potentially in parallel)
   */
  private async executeInstances(instanceIds: string[]): Promise<void> {
    if (instanceIds.length === 0) {
      return
    }

    // Execute in parallel
    const results = await Promise.all(
      instanceIds.map((id) => this.executeInstance(id))
    )

    // Collect all next instances to execute
    const nextInstances: string[] = []
    for (const result of results) {
      if (result) {
        const next = resolveNextInstances(
          this.graph[result.instanceId].next,
          result.selectedBranch
        )
        nextInstances.push(...next)
      }
    }

    // Execute next instances
    if (nextInstances.length > 0) {
      await this.executeInstances(nextInstances)
    }
  }

  /**
   * Execute a single instance
   */
  private async executeInstance(
    instanceId: string
  ): Promise<NodeExecutionResult | null> {
    const instance = this.graph[instanceId]
    if (!instance) {
      throw new InvalidNodeReferenceError('unknown', instanceId)
    }

    // Get current iteration
    const iteration = this.state.iterations.get(instanceId) || 0
    const maxIterations =
      instance.maxIterations ??
      this.options.maxIterations ??
      DEFAULT_MAX_ITERATIONS

    // Check max iterations
    if (iteration >= maxIterations) {
      throw new MaxIterationsExceededError(instanceId, maxIterations)
    }

    // Mark as executing
    this.state.executing.add(instanceId)

    // Create path resolver context
    const context: PathResolverContext = {
      completed: this.state.completed,
      triggerInput: this.state.input,
    }

    // Resolve inputs
    let resolvedInputs: Record<string, unknown>
    try {
      resolvedInputs = resolveInputs(instance.input, context)
    } catch (error) {
      // Input resolution failed
      this.state.executing.delete(instanceId)
      throw error
    }

    // Create graph context for the function
    let selectedBranch: string | undefined
    const graphContext: GraphContext<string> = {
      branch: (name: string) => {
        selectedBranch = name
      },
      iteration,
    }

    // Execute the node via RPC
    // stepName would be used for durability: `${instanceId}-${iteration}`
    let result: NodeExecutionResult

    try {
      const output = await this.rpcService.rpcWithWire(
        instance.nodeId,
        resolvedInputs,
        { graph: graphContext }
      )

      result = {
        instanceId,
        iteration,
        output,
        selectedBranch,
      }

      // Store result
      this.state.completed.set(instanceId, result)
    } catch (error) {
      result = {
        instanceId,
        iteration,
        error: error instanceof Error ? error : new Error(String(error)),
      }

      // Handle error routing
      if (instance.onError) {
        // Store error result
        this.state.completed.set(instanceId, result)
        this.state.executing.delete(instanceId)

        // Execute error handlers
        const errorHandlers =
          typeof instance.onError === 'string'
            ? [instance.onError]
            : instance.onError

        await this.executeInstances(errorHandlers)
        return null // Error was handled
      }

      // Check global error handler
      if (this.options.globalErrorHandler) {
        this.state.completed.set(instanceId, result)
        this.state.executing.delete(instanceId)
        await this.executeInstances([this.options.globalErrorHandler])
        return null
      }

      // No error handler - fail workflow
      this.state.status = 'failed'
      this.state.error = result.error
      this.state.executing.delete(instanceId)
      throw error
    }

    // Increment iteration for next time this instance is visited
    this.state.iterations.set(instanceId, iteration + 1)
    this.state.executing.delete(instanceId)

    return result
  }
}

/**
 * Execute a workflow graph
 */
export async function executeWorkflowGraph(
  graph: WorkflowGraph,
  runId: string,
  input: unknown,
  rpcService: any,
  options?: WorkflowGraphExecutionOptions
): Promise<WorkflowGraphRunState> {
  const scheduler = new WorkflowGraphScheduler(
    graph,
    runId,
    input,
    rpcService,
    options
  )
  return scheduler.execute()
}
