import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState } from '../types.js'

const DURABLE_FLOWS = new Set([
  'sleep',
  'suspend',
  'approval',
  'parallel',
  'fanout',
])

/** Warns about a workflow with at most one RPC step and nothing to wait on or fan out: it is a function or a queue job wearing a workflow's cost. */
export function validateSingleStepWorkflows(
  logger: InspectorLogger,
  state: InspectorState
): void {
  for (const [name, graph] of Object.entries(state.workflows.graphMeta)) {
    if (graph.source === 'scenario') continue
    const file =
      state.workflows.files.get(graph.pikkuFuncId)?.path ??
      state.workflows.graphFiles.get(name)?.path
    if (!file) continue
    const nodes = Object.values(graph.nodes)
    const rpcSteps = nodes.filter((n) => 'rpcName' in n && n.rpcName)
    if (rpcSteps.length > 1) continue
    if (nodes.some((n) => 'flow' in n && DURABLE_FLOWS.has(n.flow))) continue
    logger.diagnostic({
      severity: 'warn',
      code: ErrorCode.SINGLE_STEP_WORKFLOW,
      message:
        `Workflow '${name}' (${file}) runs ${rpcSteps.length === 0 ? 'no RPC step' : 'a single RPC step'} ` +
        `and never sleeps, suspends or fans out, so it buys nothing a workflow is for. ` +
        `Call the function directly, or enqueue it on a queue worker if it must survive a restart.`,
    })
  }
}
