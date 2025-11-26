/**
 * WorkflowGraph Validator
 * Validates workflow graph structure and references.
 */

import type {
  WorkflowGraph,
  WorkflowGraphNodeInstance,
  WorkflowGraphValidationError,
  WorkflowGraphValidationResult,
} from '@pikku/core/workflow'
import { validatePath, findTriggerNodes } from '@pikku/core/workflow'
import type { ForgeNodesMeta } from '@pikku/core'

/**
 * Validate a workflow graph
 *
 * @param graph - The workflow graph to validate
 * @param forgeNodes - Optional forge nodes metadata for nodeId validation
 * @returns Validation result with errors and warnings
 */
export function validateWorkflowGraph(
  graph: WorkflowGraph,
  forgeNodes?: ForgeNodesMeta
): WorkflowGraphValidationResult {
  const errors: WorkflowGraphValidationError[] = []
  const warnings: WorkflowGraphValidationError[] = []

  // 1. Check for at least one trigger node
  const triggerNodes = findTriggerNodes(graph)
  if (triggerNodes.length === 0) {
    errors.push({
      type: 'missing_trigger',
      instanceId: '',
      message:
        'WorkflowGraph must have at least one trigger node (node with no incoming edges)',
    })
  }

  // Build set of all instance IDs for reference validation
  const instanceIds = new Set(Object.keys(graph))

  // Validate each node instance
  for (const [instanceId, instance] of Object.entries(graph)) {
    // 2. Validate nodeId references (if forge nodes metadata provided)
    if (forgeNodes) {
      const nodeIdValid = validateNodeId(instance.nodeId, forgeNodes)
      if (!nodeIdValid.valid) {
        errors.push({
          type: 'invalid_node_id',
          instanceId,
          message: nodeIdValid.error!,
          details: { nodeId: instance.nodeId },
        })
      }
    }

    // 3. Validate input path references
    for (const [inputName, inputValue] of Object.entries(instance.input)) {
      if (inputValue.type === 'ref') {
        const pathResult = validatePath(inputValue.path)
        if (!pathResult.valid) {
          errors.push({
            type: 'invalid_path_ref',
            instanceId,
            message: `Invalid path reference for input '${inputName}': ${pathResult.error}`,
            details: { inputName, path: inputValue.path },
          })
        } else {
          // Check if referenced instance exists
          const refInstanceId = inputValue.path.split('.')[0]
          if (!instanceIds.has(refInstanceId)) {
            errors.push({
              type: 'invalid_path_ref',
              instanceId,
              message: `Input '${inputName}' references non-existent instance '${refInstanceId}'`,
              details: {
                inputName,
                path: inputValue.path,
                referencedInstance: refInstanceId,
              },
            })
          }
        }
      }
    }

    // 4. Validate next targets
    if (instance.next) {
      const nextTargets = collectNextTargets(instance.next)
      for (const target of nextTargets) {
        if (!instanceIds.has(target)) {
          errors.push({
            type: 'invalid_next_target',
            instanceId,
            message: `'next' references non-existent instance '${target}'`,
            details: { target },
          })
        }
      }
    }

    // 5. Validate onError targets
    if (instance.onError) {
      const errorTargets =
        typeof instance.onError === 'string'
          ? [instance.onError]
          : instance.onError

      for (const target of errorTargets) {
        if (!instanceIds.has(target)) {
          errors.push({
            type: 'invalid_on_error',
            instanceId,
            message: `'onError' references non-existent instance '${target}'`,
            details: { target },
          })
        }
      }

      // Validate that onError is only set if node has errorOutput
      if (forgeNodes) {
        const nodeIdValid = validateNodeId(instance.nodeId, forgeNodes)
        if (nodeIdValid.valid && nodeIdValid.node) {
          if (!nodeIdValid.node.errorOutput) {
            errors.push({
              type: 'invalid_on_error',
              instanceId,
              message: `'onError' is set but node '${instance.nodeId}' does not have errorOutput enabled`,
              details: { nodeId: instance.nodeId },
            })
          }
        }
      }
    }
  }

  // 6. Detect cycles (warning, not error)
  const cycles = detectCycles(graph)
  for (const cycle of cycles) {
    warnings.push({
      type: 'cycle_detected',
      instanceId: cycle[0],
      message: `Cycle detected: ${cycle.join(' -> ')}`,
      details: { cycle },
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate a nodeId against forge nodes metadata
 */
function validateNodeId(
  nodeId: string,
  forgeNodes: ForgeNodesMeta
): { valid: boolean; error?: string; node?: ForgeNodesMeta[string] } {
  // Parse nodeId: '@package:nodeName' or 'nodeName'
  const colonIndex = nodeId.lastIndexOf(':')
  const nodeName = colonIndex !== -1 ? nodeId.slice(colonIndex + 1) : nodeId

  const node = forgeNodes[nodeName]
  if (!node) {
    return {
      valid: false,
      error: `Node '${nodeName}' not found in forge nodes metadata`,
    }
  }

  return { valid: true, node }
}

/**
 * Collect all target instance IDs from a next configuration
 */
function collectNextTargets(next: WorkflowGraphNodeInstance['next']): string[] {
  if (!next) return []

  if (typeof next === 'string') {
    return [next]
  }

  if (Array.isArray(next)) {
    return next
  }

  // Record<string, string | string[]>
  const targets: string[] = []
  for (const value of Object.values(next)) {
    if (typeof value === 'string') {
      targets.push(value)
    } else {
      targets.push(...value)
    }
  }
  return targets
}

/**
 * Detect cycles in the graph using DFS
 * Returns array of cycle paths
 */
function detectCycles(graph: WorkflowGraph): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const parent = new Map<string, string>()

  function dfs(instanceId: string, path: string[]): void {
    visited.add(instanceId)
    recursionStack.add(instanceId)
    path.push(instanceId)

    const instance = graph[instanceId]
    if (instance?.next) {
      const targets = collectNextTargets(instance.next)
      for (const target of targets) {
        if (!visited.has(target)) {
          parent.set(target, instanceId)
          dfs(target, [...path])
        } else if (recursionStack.has(target)) {
          // Found a cycle
          const cycleStart = path.indexOf(target)
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), target])
          }
        }
      }
    }

    recursionStack.delete(instanceId)
  }

  for (const instanceId of Object.keys(graph)) {
    if (!visited.has(instanceId)) {
      dfs(instanceId, [])
    }
  }

  return cycles
}

/**
 * Quick validation - just checks if graph has basic structure
 */
export function quickValidateWorkflowGraph(graph: WorkflowGraph): boolean {
  // Must have at least one node
  if (Object.keys(graph).length === 0) {
    return false
  }

  // Must have at least one trigger
  const triggers = findTriggerNodes(graph)
  if (triggers.length === 0) {
    return false
  }

  // All instances must have nodeId
  for (const instance of Object.values(graph)) {
    if (!instance.nodeId) {
      return false
    }
  }

  return true
}
