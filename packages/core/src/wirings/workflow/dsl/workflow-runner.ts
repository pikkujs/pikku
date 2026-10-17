import { pikkuState } from '../../../pikku-state.js'
import { addFunction } from '../../../function/function-runner.js'

/**
 * Registers a workflow under its generated name. Called by generated code; an
 * app declares workflows with `pikkuWorkflowFunc` and its relatives instead.
 * Skipped with a warning when no metadata was generated for the name.
 *
 * @internal
 */
export const addWorkflow = (
  workflowName: string,
  workflowFunc: any,
  packageName: string | null = null
) => {
  const meta = pikkuState(packageName, 'workflows', 'meta')
  const workflowMeta = meta[workflowName]
  if (!workflowMeta) {
    console.warn(
      `[pikku] Skipping workflow '${workflowName}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }

  const registrations = pikkuState(packageName, 'workflows', 'registrations')
  registrations.set(workflowName, {
    name: workflowName,
    func: workflowFunc,
  })

  addFunction(workflowMeta.pikkuFuncId, workflowFunc, packageName)
}
