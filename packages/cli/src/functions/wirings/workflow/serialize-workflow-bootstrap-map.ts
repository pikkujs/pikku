import type { WorkflowsMeta } from '@pikku/core/ecosystem/workflow'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

/**
 * A workflow or graph node name is free-form prose written by a human, so an
 * apostrophe or a backslash in it is ordinary. `JSON.stringify` emits a valid,
 * escaped TypeScript string literal; interpolating the raw name into a quoted
 * key terminates the string and the whole `.d.ts` stops parsing.
 */
const key = (name: string) => JSON.stringify(name)

export const serializeWorkflowBootstrapMap = (
  workflowsMeta: WorkflowsMeta,
  graphMeta: SerializedWorkflowGraphs
) => {
  const workflowEntries = Object.keys(workflowsMeta)
    .sort()
    .map(
      (workflowName) =>
        `  readonly ${key(workflowName)}: WorkflowHandler<unknown, unknown>,`
    )
    .join('\n')

  const graphEntries = Object.entries(graphMeta)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([graphName, graph]) => {
      const nodeEntries = Object.keys(graph.nodes)
        .sort()
        .map(
          (nodeId) => `    readonly ${key(nodeId)}: GraphNodeHandler<unknown>,`
        )
        .join('\n')

      return `  readonly ${key(graphName)}: {\n${nodeEntries}\n  },`
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
