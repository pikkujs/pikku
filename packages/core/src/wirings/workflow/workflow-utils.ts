import { pikkuState } from '../../pikku-state.js'
import { NotFoundError } from '../../errors/errors.js'
import {
  PikkuWire,
  CreateWireServices,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from '../../types/core.types.js'
import { ContextAwareRPCService } from '../rpc/rpc-runner.js'

/**
 * Start a workflow triggered by a wire lookup
 * Looks up the wire from the unified workflows.wires state
 */
export const startWorkflowByWire = async (
  wireType: 'http' | 'trigger',
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
  const wires = pikkuState(null, 'workflows', 'wires')
  const match = (wires as any)[wireType]?.[wireKey]
  if (!match) {
    throw new NotFoundError(
      `No workflow found for ${wireType} wire: ${wireKey}`
    )
  }

  const workflowService = singletonServices.workflowService
  if (!workflowService) {
    throw new Error('WorkflowService not available')
  }

  const wireServices = createWireServices?.(singletonServices, wire)
  const rpcService = new ContextAwareRPCService(
    { ...singletonServices, ...wireServices },
    wire,
    {}
  )

  // For http wires, match is a single object; for trigger wires, it's an array
  if (wireType === 'http') {
    await workflowService.startWorkflow(match.workflowName, data, rpcService, {
      inline: true,
      startNode: match.startNode,
    })
  }
}
