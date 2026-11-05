import { outgoingTraceparent, type TraceContext } from '../trace.js'
import type { JobOptions, QueueService } from '../wirings/queue/queue.types.js'

/**
 * Stamps every job a function enqueues with the function's trace, so neither
 * the call site nor the generated `PikkuQueue` has to pass it. Read at `add`
 * time because an authenticated caller can adopt a trace mid-invocation. A
 * `traceparent` the caller set wins.
 *
 * knowledge: decisions/internals/a-job-inherits-the-trace-of-the-function-that-enqueued-it.md
 */
export const traceQueueService = <Service extends QueueService>(
  queueService: Service,
  wire: { trace?: TraceContext }
): Service =>
  new Proxy(queueService, {
    get(target, property) {
      if (property === 'add') {
        return (queueName: string, data: any, options?: JobOptions) => {
          const traceparent = options?.traceparent ?? outgoingTraceparent(wire)
          return target.add(
            queueName,
            data,
            traceparent ? { ...options, traceparent } : options
          )
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
