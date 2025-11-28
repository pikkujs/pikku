import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type {
  GraphNodeConfig,
  InputType,
  RefFn,
  InputMapping,
  NextConfig,
} from './workflow-graph.types.js'

/**
 * Creates a graph node configuration with type-safe input mapping.
 *
 * @example
 * ```typescript
 * // Simple node with no inputs (entry node)
 * const entry = graphNode(entryFunc)
 *
 * // Node with single next
 * const step1 = graphNode(step1Func, {
 *   next: 'step2'
 * })
 *
 * // Node with parallel next (fan-out)
 * const fork = graphNode(forkFunc, {
 *   next: ['taskA', 'taskB', 'taskC']
 * })
 *
 * // Node with branching (function calls graph.branch('key'))
 * const validate = graphNode(validateFunc, {
 *   input: (ref) => ({
 *     data: ref('entry', 'data'),
 *   }),
 *   next: {
 *     'valid': ['processPayment'],
 *     'invalid': ['sendError']
 *   }
 * })
 * ```
 */
export function graphNode<
  Func extends CorePikkuFunctionConfig<any, any, any, any, any>,
  NodeIds extends string = string,
>(
  func: Func,
  config?: {
    input?: (ref: RefFn<NodeIds>) => InputMapping<InputType<Func>>
    next?: NextConfig<NodeIds>
    onError?: NodeIds | NodeIds[]
  }
): GraphNodeConfig<Func, NodeIds> {
  return {
    func,
    input: config?.input,
    next: config?.next,
    onError: config?.onError,
  }
}
