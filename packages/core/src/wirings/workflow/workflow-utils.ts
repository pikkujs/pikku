import { pikkuState } from '../../pikku-state.js'
import { NotFoundError } from '../../errors/errors.js'
import {
  PikkuWire,
  CreateWireServices,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from '../../types/core.types.js'
import { HTTPWiringMeta } from '../http/http.types.js'
import { ContextAwareRPCService } from '../rpc/rpc-runner.js'

/**
 * Find workflow name by matching route and method against workflow wires
 */
export const findWorkflowByHttpWire = (
  route: string,
  method: string
): string | undefined => {
  const wirings = pikkuState(null, 'workflows', 'wirings')
  const graphWirings = pikkuState(null, 'workflows', 'graphWirings')

  // Check DSL workflow wirings
  for (const [, wiring] of wirings) {
    if (
      wiring.wires?.http?.route === route &&
      wiring.wires?.http?.method === method
    ) {
      const meta = pikkuState(null, 'workflows', 'meta')
      for (const [name, workflowMeta] of Object.entries(meta)) {
        if (workflowMeta.source !== 'graph') {
          const registrations = pikkuState(null, 'workflows', 'registrations')
          if (registrations.has(name)) {
            return name
          }
        }
      }
    }
  }

  // Check graph workflow wirings
  for (const [, wiring] of graphWirings) {
    if (
      wiring.wires?.http?.route === route &&
      wiring.wires?.http?.method === method
    ) {
      const meta = pikkuState(null, 'workflows', 'meta')
      for (const [name, workflowMeta] of Object.entries(meta)) {
        if (workflowMeta.source === 'graph') {
          return name
        }
      }
    }
  }

  return undefined
}

/**
 * Start a workflow triggered by an HTTP wire
 * The workflow is responsible for handling the HTTP response
 */
export const startWorkflowByHttpWire = async (
  singletonServices: CoreSingletonServices,
  createWireServices:
    | CreateWireServices<
        CoreSingletonServices,
        CoreServices<CoreSingletonServices>,
        CoreUserSession
      >
    | undefined,
  matchedRoute: {
    matchedPath: any
    params: any
    route: any
    meta: HTTPWiringMeta
  },
  wire: PikkuWire
): Promise<void> => {
  const { meta } = matchedRoute

  const workflowName = findWorkflowByHttpWire(meta.route, meta.method)
  if (!workflowName) {
    throw new NotFoundError(
      `No workflow found for route ${meta.method.toUpperCase()} ${meta.route}`
    )
  }

  const workflowService = singletonServices.workflowService
  if (!workflowService) {
    throw new Error('WorkflowService not available')
  }

  const data = await wire.http!.request!.data()

  const wireServices = createWireServices?.(singletonServices, wire)
  const rpcService = new ContextAwareRPCService(
    { ...singletonServices, ...wireServices },
    wire,
    {}
  )
  await workflowService.startWorkflow(workflowName, data, rpcService, {
    inline: true,
  })
}
