import { pikkuState } from '../../../pikku-state.js'
import { addFunction } from '../../../function/function-runner.js'
import { PikkuMissingMetaError } from '../../../errors/errors.js'

/**
 * Add a workflow to the system
 * This is called by the generated workflow wirings
 */
export const addWorkflow = (workflowName: string, workflowFunc: any) => {
  // Get workflow metadata from inspector
  const meta = pikkuState(null, 'workflows', 'meta')
  const workflowMeta = meta[workflowName]
  if (!workflowMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for workflow '${workflowName}'`
    )
  }

  // Store workflow definition in state
  const registrations = pikkuState(null, 'workflows', 'registrations')
  registrations.set(workflowName, {
    name: workflowName,
    func: workflowFunc,
  })

  // Register the function with pikku
  addFunction(workflowMeta.pikkuFuncId, workflowFunc)
}
