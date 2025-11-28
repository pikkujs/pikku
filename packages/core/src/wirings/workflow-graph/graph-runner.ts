import type { PikkuWorkflowService } from '../workflow/pikku-workflow-service.js'
import type { PikkuGraphWire, GraphWireState } from './workflow-graph.types.js'

/**
 * Creates a PikkuGraphWire context for graph node execution.
 * The wire provides:
 * - runId, graphName, nodeId context
 * - branch() function to select branching path
 *
 * @param runId - Workflow run ID
 * @param graphName - Name of the workflow graph
 * @param nodeId - Current node ID being executed
 * @param state - Mutable state object to capture branch selection
 */
export function createGraphWire(
  runId: string,
  graphName: string,
  nodeId: string,
  state: GraphWireState
): PikkuGraphWire {
  return {
    runId,
    graphName,
    nodeId,
    branch: (key: string) => {
      state.branchKey = key
    },
  }
}

/**
 * Execute a graph node with wire context.
 * Sets up the graph wire, runs the RPC, and stores branch key if set.
 *
 * @param workflowService - The workflow service for state management
 * @param rpcService - The RPC service for function execution
 * @param runId - Workflow run ID
 * @param graphName - Name of the workflow graph
 * @param nodeId - Node ID to execute
 * @param stepId - Step ID for storing branch key
 * @param rpcName - RPC function name
 * @param data - Input data for the function
 */
export async function executeGraphNode(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  graphName: string,
  nodeId: string,
  stepId: string,
  rpcName: string,
  data: any
): Promise<any> {
  // Create mutable state to capture branch selection
  const wireState: GraphWireState = {}

  // Create the graph wire context
  const graphWire = createGraphWire(runId, graphName, nodeId, wireState)

  // Execute the RPC with graph wire context
  const result = await rpcService.rpcWithWire(rpcName, data, {
    graph: graphWire,
  })

  // If branch was called, store the branch key
  if (wireState.branchKey) {
    await workflowService.setBranchTaken(stepId, wireState.branchKey)
  }

  return result
}
