import type { WorkflowsMeta } from '@pikku/core/workflow'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

export const serializeWorkflowBootstrapMap = (
  workflowsMeta: WorkflowsMeta,
  graphMeta: SerializedWorkflowGraphs
) => {
  const workflowEntries = Object.keys(workflowsMeta)
    .sort()
    .map(
      (workflowName) =>
        `  readonly '${workflowName}': WorkflowHandler<unknown, unknown>,`
    )
    .join('\n')

  const graphEntries = Object.entries(graphMeta)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([graphName, graph]) => {
      const nodeEntries = Object.keys(graph.nodes)
        .sort()
        .map((nodeId) => `    readonly '${nodeId}': GraphNodeHandler<unknown>,`)
        .join('\n')

      return `  readonly '${graphName}': {\n${nodeEntries}\n  },`
    })
    .join('\n')

  return `/**
 * Bootstrap-safe workflow type map.
 * Full input/output types are populated by the later \`pikku all\` pass.
 */

interface WorkflowHandler<I, O> {
  input: I;
  output: O;
}

interface GraphNodeHandler<I> {
  input: I;
}

export type WorkflowMap = {
${workflowEntries}
};

export type GraphsMap = {
${graphEntries}
};

export type FlattenedWorkflowMap = WorkflowMap
`
}
