import { pikkuState } from '../../../pikku-state.js'
import { addFunction } from '../../../function/function-runner.js'

/**
 * Add a workflow to the system
 * This is called by the generated workflow wirings
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
