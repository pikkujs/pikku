import { outgoingTraceparent, type TraceContext } from '../trace.js'
import type { SchedulerService } from '../services/scheduler-service.js'
import type { WebhookService } from '../services/webhook-service.js'
import type { JobOptions, QueueService } from '../wirings/queue/queue.types.js'

const passThrough = (target: object, property: string | symbol) => {
  const value = Reflect.get(target, property, target)
  return typeof value === 'function' ? value.bind(target) : value
}

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
      return passThrough(target, property)
    },
  })

/** {@link traceQueueService} for one-off delayed RPCs. */
export const traceSchedulerService = <Service extends SchedulerService>(
  schedulerService: Service,
  wire: { trace?: TraceContext }
): Service =>
  new Proxy(schedulerService, {
    get(target, property) {
      if (property === 'scheduleRPC') {
        return (
          delay: number | string,
          rpcName: string,
          data?: unknown,
          session?: Parameters<SchedulerService['scheduleRPC']>[3],
          traceparent?: string
        ) =>
          target.scheduleRPC(
            delay,
            rpcName,
            data,
            session,
            traceparent ?? outgoingTraceparent(wire)
          )
      }
      return passThrough(target, property)
    },
  })

/**
 * {@link traceQueueService} for outgoing webhooks. The trace rides on the
 * delivery job and stays out of the request: the receiver is a third party.
 */
export const traceWebhookService = <Service extends WebhookService>(
  webhookService: Service,
  wire: { trace?: TraceContext }
): Service =>
  new Proxy(webhookService, {
    get(target, property) {
      if (property === 'send') {
        return (input: Parameters<WebhookService['send']>[0]) =>
          target.send({
            ...input,
            traceparent: input.traceparent ?? outgoingTraceparent(wire),
          })
      }
      return passThrough(target, property)
    },
  })
