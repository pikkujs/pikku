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
import { WorkflowTriggerWire } from './workflow.types.js'

/**
 * Result of finding a workflow by HTTP wire
 */
export interface WorkflowHttpMatch {
  workflowName: string
  startNode?: string
}

/**
 * Find a workflow that declares a trigger wire matching the given trigger name.
 * Returns the workflow name and the startNode from the wire config.
 *
 * Checks graph registrations (runtime wires from pikkuWorkflowGraph),
 * meta wires (serialized by CLI), and DSL wirings.
 */
export const findWorkflowByTriggerWire = (
  triggerName: string
): { workflowName: string; startNode: string } | undefined => {
  // Check graph registrations (populated by addWorkflowGraph at runtime)
  const graphRegistrations = pikkuState(null, 'workflows', 'graphRegistrations')
  for (const [name, reg] of graphRegistrations) {
    const triggers = reg.wires?.trigger as WorkflowTriggerWire[] | undefined
    if (!triggers) continue
    const matched = triggers.find((t) => t.name === triggerName)
    if (matched) {
      return { workflowName: name, startNode: matched.startNode }
    }
  }

  // Check workflow meta wires (serialized by CLI)
  const meta = pikkuState(null, 'workflows', 'meta')
  for (const [name, m] of Object.entries(meta)) {
    const triggers = m.wires?.trigger as WorkflowTriggerWire[] | undefined
    if (!triggers) continue
    const matched = triggers.find((t) => t.name === triggerName)
    if (matched) {
      return { workflowName: name, startNode: matched.startNode }
    }
  }

  // Check DSL wirings
  const wirings = pikkuState(null, 'workflows', 'wirings')
  for (const [, wiring] of wirings) {
    const triggers = wiring.wires?.trigger as WorkflowTriggerWire[] | undefined
    if (!triggers) continue
    const matched = triggers.find((t) => t.name === triggerName)
    if (matched) {
      // Find the workflow name from meta
      for (const [name, m] of Object.entries(meta)) {
        if (m.source !== 'graph' && m.wires === wiring.wires) {
          return { workflowName: name, startNode: matched.startNode }
        }
      }
    }
  }

  return undefined
}

/**
 * Find workflow name by matching route and method against workflow wires
 */
export const findWorkflowByHttpWire = (
  route: string,
  method: string
): WorkflowHttpMatch | undefined => {
  const wirings = pikkuState(null, 'workflows', 'wirings')
  const graphWirings = pikkuState(null, 'workflows', 'graphWirings')

  // Check DSL workflow wirings
  for (const [, wiring] of wirings) {
    const httpWires = wiring.wires?.http
    if (httpWires) {
      const matchedWire = httpWires.find(
        (w) => w.route === route && w.method === method
      )
      if (matchedWire) {
        const meta = pikkuState(null, 'workflows', 'meta')
        for (const [name, workflowMeta] of Object.entries(meta)) {
          if (workflowMeta.source !== 'graph') {
            const registrations = pikkuState(null, 'workflows', 'registrations')
            if (registrations.has(name)) {
              return { workflowName: name, startNode: matchedWire.startNode }
            }
          }
        }
      }
    }
  }

  // Check graph workflow wirings
  for (const [, wiring] of graphWirings) {
    const httpWires = wiring.wires?.http
    if (httpWires) {
      const matchedWire = httpWires.find(
        (w) => w.route === route && w.method === method
      )
      if (matchedWire) {
        const meta = pikkuState(null, 'workflows', 'meta')
        for (const [name, workflowMeta] of Object.entries(meta)) {
          if (workflowMeta.source === 'graph') {
            return { workflowName: name, startNode: matchedWire.startNode }
          }
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

  const match = findWorkflowByHttpWire(meta.route, meta.method)
  if (!match) {
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
  await workflowService.startWorkflow(match.workflowName, data, rpcService, {
    inline: true,
    startNode: match.startNode,
  })
}
