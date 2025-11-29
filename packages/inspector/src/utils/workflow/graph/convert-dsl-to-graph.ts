/**
 * Converts DSL (Domain Specific Language) step-based format to graph node format
 */
import type { WorkflowStepMeta, WorkflowsMeta } from '@pikku/core/workflow'
import type {
  SerializedGraphNode,
  SerializedWorkflowGraph,
  FunctionNode,
  FlowNode,
  DataRef,
} from './workflow-graph.types.js'

/**
 * Check if a node is a terminal flow (no next step should follow)
 */
function isTerminalFlow(node: SerializedGraphNode): boolean {
  if ('flow' in node) {
    // Cancel and return are terminal flows - they end execution
    return node.flow === 'cancel' || node.flow === 'return'
  }
  return false
}

/**
 * Convert InputSource to DataRef
 */
function convertInputSource(source: {
  from: string
  path?: string
  name?: string
  value?: unknown
}): unknown | DataRef {
  if (source.from === 'literal') {
    return source.value
  }
  if (source.from === 'input') {
    return { $ref: 'trigger', path: source.path }
  }
  if (source.from === 'outputVar') {
    return { $ref: source.name!, path: source.path }
  }
  if (source.from === 'item') {
    return { $ref: '$item', path: source.path }
  }
  return source.value
}

/**
 * Convert a single DSL step to graph node(s)
 */
function convertStepToNode(
  step: WorkflowStepMeta,
  index: number,
  steps: WorkflowStepMeta[],
  nodeIdPrefix: string = 'step'
): SerializedGraphNode[] {
  const nodeId = `${nodeIdPrefix}_${index}`
  const nextNodeId =
    index < steps.length - 1 ? `${nodeIdPrefix}_${index + 1}` : undefined

  switch (step.type) {
    case 'rpc': {
      const node: FunctionNode = {
        nodeId,
        rpcName: step.rpcName,
        stepName: step.stepName,
        next: nextNodeId,
      }
      if (step.inputs) {
        if (step.inputs === 'passthrough') {
          // Entire data is passed through - store as reference to trigger
          node.input = { $passthrough: { $ref: 'trigger' } }
        } else {
          node.input = {}
          for (const [key, source] of Object.entries(step.inputs)) {
            node.input[key] = convertInputSource(source as any)
          }
        }
      }
      if (step.outputVar) {
        node.outputVar = step.outputVar
      }
      if (step.options) {
        node.options = {
          retries: step.options.retries,
          retryDelay: step.options.retryDelay?.toString(),
        }
      }
      return [node]
    }

    case 'sleep': {
      const node: FlowNode = {
        nodeId,
        flow: 'sleep',
        stepName: step.stepName,
        duration: step.duration,
        next: nextNodeId,
      }
      return [node]
    }

    case 'inline': {
      const node: FlowNode = {
        nodeId,
        flow: 'inline',
        stepName: step.stepName,
        description: step.description,
        next: nextNodeId,
      }
      return [node]
    }

    case 'branch': {
      // Convert nested then/else steps
      const thenNodes = convertStepsToNodes(step.thenSteps, `${nodeId}_then`)
      const elseNodes = step.elseSteps
        ? convertStepsToNodes(step.elseSteps, `${nodeId}_else`)
        : []

      const node: FlowNode = {
        nodeId,
        flow: 'branch',
        conditions: step.conditions,
        thenEntry: thenNodes.length > 0 ? thenNodes[0].nodeId : undefined,
        elseEntry: elseNodes.length > 0 ? elseNodes[0].nodeId : undefined,
        next: nextNodeId,
      }

      // Link last then/else nodes back to next (unless terminal flow)
      if (thenNodes.length > 0 && nextNodeId) {
        const lastThen = thenNodes[thenNodes.length - 1]
        if (!lastThen.next && !isTerminalFlow(lastThen))
          lastThen.next = nextNodeId
      }
      if (elseNodes.length > 0 && nextNodeId) {
        const lastElse = elseNodes[elseNodes.length - 1]
        if (!lastElse.next && !isTerminalFlow(lastElse))
          lastElse.next = nextNodeId
      }

      return [node, ...thenNodes, ...elseNodes]
    }

    case 'switch': {
      const caseNodes: SerializedGraphNode[] = []
      const cases: Array<{
        value?: unknown
        expression?: string
        entry: string
      }> = []

      for (let i = 0; i < step.cases.length; i++) {
        const caseSteps = convertStepsToNodes(
          step.cases[i].steps,
          `${nodeId}_case${i}`
        )
        if (caseSteps.length > 0) {
          cases.push({
            value: step.cases[i].value,
            expression: step.cases[i].expression,
            entry: caseSteps[0].nodeId,
          })
          // Link last case node to next (unless terminal flow)
          if (nextNodeId) {
            const lastCase = caseSteps[caseSteps.length - 1]
            if (!lastCase.next && !isTerminalFlow(lastCase))
              lastCase.next = nextNodeId
          }
          caseNodes.push(...caseSteps)
        }
      }

      let defaultEntry: string | undefined
      if (step.defaultSteps) {
        const defaultNodes = convertStepsToNodes(
          step.defaultSteps,
          `${nodeId}_default`
        )
        if (defaultNodes.length > 0) {
          defaultEntry = defaultNodes[0].nodeId
          // Link last default node to next (unless terminal flow)
          if (nextNodeId) {
            const lastDefault = defaultNodes[defaultNodes.length - 1]
            if (!lastDefault.next && !isTerminalFlow(lastDefault))
              lastDefault.next = nextNodeId
          }
          caseNodes.push(...defaultNodes)
        }
      }

      const node: FlowNode = {
        nodeId,
        flow: 'switch',
        expression: step.expression,
        cases,
        defaultEntry,
        next: nextNodeId,
      }

      return [node, ...caseNodes]
    }

    case 'parallel': {
      // Convert children to nodes
      const childNodes: SerializedGraphNode[] = []
      const childEntries: string[] = []

      for (let i = 0; i < step.children.length; i++) {
        const childSteps = convertStepToNode(
          step.children[i],
          i,
          step.children,
          `${nodeId}_child`
        )
        if (childSteps.length > 0) {
          childEntries.push(childSteps[0].nodeId)
          childNodes.push(...childSteps)
        }
      }

      const node: FlowNode = {
        nodeId,
        flow: 'parallel',
        children: childEntries,
        next: nextNodeId,
      }

      return [node, ...childNodes]
    }

    case 'fanout': {
      // Convert child step
      const childNodes = convertStepToNode(
        step.child,
        0,
        [step.child],
        `${nodeId}_item`
      )

      const node: FlowNode = {
        nodeId,
        flow: 'fanout',
        stepName: step.stepName,
        sourceVar: step.sourceVar,
        itemVar: step.itemVar,
        mode: step.mode,
        childEntry: childNodes.length > 0 ? childNodes[0].nodeId : undefined,
        timeBetween: step.timeBetween,
        next: nextNodeId,
      }

      return [node, ...childNodes]
    }

    case 'filter': {
      const node: FlowNode = {
        nodeId,
        flow: 'filter',
        sourceVar: step.sourceVar,
        itemVar: step.itemVar,
        condition: step.condition,
        outputVar: step.outputVar,
        next: nextNodeId,
      }
      return [node]
    }

    case 'arrayPredicate': {
      const node: FlowNode = {
        nodeId,
        flow: 'arrayPredicate',
        mode: step.mode,
        sourceVar: step.sourceVar,
        itemVar: step.itemVar,
        condition: step.condition,
        outputVar: step.outputVar,
        next: nextNodeId,
      }
      return [node]
    }

    case 'return': {
      const node: FlowNode = {
        nodeId,
        flow: 'return',
        outputs: step.outputs,
      }
      return [node]
    }

    case 'cancel': {
      const node: FlowNode = {
        nodeId,
        flow: 'cancel',
        reason: step.reason,
      }
      return [node]
    }

    default:
      return []
  }
}

/**
 * Convert array of steps to graph nodes
 */
function convertStepsToNodes(
  steps: WorkflowStepMeta[],
  nodeIdPrefix: string = 'step'
): SerializedGraphNode[] {
  const allNodes: SerializedGraphNode[] = []

  for (let i = 0; i < steps.length; i++) {
    const nodes = convertStepToNode(steps[i], i, steps, nodeIdPrefix)
    allNodes.push(...nodes)
  }

  return allNodes
}

/**
 * Convert a DSL workflow to graph format
 */
export function convertDslToGraph(
  workflowName: string,
  meta: WorkflowsMeta[string]
): SerializedWorkflowGraph {
  const nodes = convertStepsToNodes(meta.steps)
  const nodesRecord: Record<string, SerializedGraphNode> = {}

  for (const node of nodes) {
    nodesRecord[node.nodeId] = node
  }

  // Find entry nodes (step_0 is always entry for sequential workflows)
  const entryNodeIds = nodes.length > 0 ? ['step_0'] : []

  return {
    name: workflowName,
    pikkuFuncName: meta.pikkuFuncName,
    source: 'dsl',
    description: meta.description,
    tags: meta.tags,
    wires: {}, // DSL workflows don't have explicit wires in meta
    nodes: nodesRecord,
    entryNodeIds,
  }
}

/**
 * Convert all DSL workflows to graph format
 */
export function convertAllDslToGraphs(
  workflowsMeta: WorkflowsMeta
): Record<string, SerializedWorkflowGraph> {
  const result: Record<string, SerializedWorkflowGraph> = {}

  for (const [name, meta] of Object.entries(workflowsMeta)) {
    result[name] = convertDslToGraph(name, meta)
  }

  return result
}
