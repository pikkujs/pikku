import { pikkuState } from '../../pikku-state.js'
import { NotFoundError } from '../../errors/errors.js'
import {
  PikkuWire,
  CreateWireServices,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from '../../types/core.types.js'
import { rpcService } from '../rpc/rpc-runner.js'

/**
 * Start a workflow triggered by an HTTP wire.
 * Iterates workflows.meta to find a matching HTTP wire.
 */
export const startWorkflowByHTTPWire = async (
  wireKey: string,
  singletonServices: CoreSingletonServices,
  createWireServices:
    | CreateWireServices<
        CoreSingletonServices,
        CoreServices<CoreSingletonServices>,
        CoreUserSession
      >
    | undefined,
  wire: PikkuWire,
  data: any
): Promise<void> => {
  const meta = pikkuState(null, 'workflows', 'meta')

  for (const [workflowName, wfMeta] of Object.entries(meta)) {
    for (const h of wfMeta.wires?.http ?? []) {
      if (`${h.method}:${h.route}` === wireKey) {
        const workflowService = singletonServices.workflowService
        if (!workflowService) {
          throw new Error('WorkflowService not available')
        }

        const wireServices = await createWireServices?.(singletonServices, wire)
        const services = { ...singletonServices, ...wireServices }
        const rpc = rpcService.getContextRPCService(services, wire)

        await workflowService.startWorkflow(workflowName, data, rpc, {
          inline: true,
          startNode: h.startNode,
        })
        return
      }
    }
  }

  throw new NotFoundError(`No workflow found for HTTP wire: ${wireKey}`)
}
