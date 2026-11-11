import {
  endBoundaryWhenSettled,
  startBoundarySpan,
} from '../../boundary-span.js'
import type { TraceContext } from '../../trace.js'
import type { CoreServices } from '../../types/core.types.js'

// A function name is data-driven, so it names a span only when it is a plain
// identifier; anything else would be unbounded in the store.
const SAFE_RPC_NAME = /^[A-Za-z0-9_.:@/-]{1,128}$/

/**
 * Calls a function hosted by another deployment. The call is a `client` span,
 * the remote function's parent, so the trace shows the hop; a local call adds
 * nothing because the callee is already its own span. Only the function name
 * and the service it belongs to are recorded, never the arguments.
 *
 * knowledge: decisions/internals/a-job-inherits-the-trace-of-the-function-that-enqueued-it.md
 */
export const invokeRemote = <Out>(
  services: CoreServices,
  wire: { trace?: TraceContext },
  funcName: string,
  data: unknown,
  session: unknown
): Promise<Out> => {
  const safe = SAFE_RPC_NAME.test(funcName)
  const boundary = startBoundarySpan(
    { tracer: services.tracer, logger: services.logger },
    wire,
    safe ? `rpc.call ${funcName}` : 'rpc.call',
    'client',
    {
      'rpc.service':
        safe && funcName.includes(':')
          ? funcName.slice(0, funcName.indexOf(':'))
          : 'deployment',
    }
  )
  return endBoundaryWhenSettled(
    boundary,
    () =>
      services.deploymentService!.invoke(
        funcName,
        data,
        session,
        boundary.traceparent
      ) as Promise<Out>
  )
}
