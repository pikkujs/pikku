import type { TraceContext } from '../trace.js'
import type { Logger } from '../services/logger.js'
import type { Tracer } from '../tracer.js'
import { endBoundaryWhenSettled, startBoundarySpan } from '../boundary-span.js'
import type { SchedulerService } from '../services/scheduler-service.js'
import type { WebhookService } from '../services/webhook-service.js'
import type { JobOptions, QueueService } from '../wirings/queue/queue.types.js'

/** Where boundary spans go. Absent (or a no-op tracer) records nothing. */
export type BoundaryTracing = { tracer?: Tracer; logger?: Logger }

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
 * With a tracer, the publish is a `producer` span `queue.publish <queue>`, and
 * the job carries that span as its parent, so the consumer is its child.
 *
 * knowledge: decisions/internals/a-job-inherits-the-trace-of-the-function-that-enqueued-it.md
 */
export const traceQueueService = <Service extends QueueService>(
  queueService: Service,
  wire: { trace?: TraceContext },
  tracing?: BoundaryTracing
): Service =>
  new Proxy(queueService, {
    get(target, property) {
      if (property === 'add') {
        return (queueName: string, data: any, options?: JobOptions) => {
          const boundary = startBoundarySpan(
            tracing,
            wire,
            `queue.publish ${queueName}`,
            'producer',
            {
              'messaging.system': 'pikku',
              'messaging.destination.name': queueName,
            }
          )
          const traceparent = options?.traceparent ?? boundary.traceparent
          return endBoundaryWhenSettled(boundary, () =>
            target.add(
              queueName,
              data,
              traceparent ? { ...options, traceparent } : options
            )
          )
        }
      }
      return passThrough(target, property)
    },
  })

/** {@link traceQueueService} for one-off delayed RPCs. */
export const traceSchedulerService = <Service extends SchedulerService>(
  schedulerService: Service,
  wire: { trace?: TraceContext },
  tracing?: BoundaryTracing
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
        ) => {
          const boundary = startBoundarySpan(
            tracing,
            wire,
            'scheduler.schedule',
            'producer',
            {
              'messaging.system': 'pikku',
              'messaging.destination.name': rpcName,
            }
          )
          return endBoundaryWhenSettled(boundary, () =>
            target.scheduleRPC(
              delay,
              rpcName,
              data,
              session,
              traceparent ?? boundary.traceparent
            )
          )
        }
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
  wire: { trace?: TraceContext },
  tracing?: BoundaryTracing
): Service =>
  new Proxy(webhookService, {
    get(target, property) {
      if (property === 'send') {
        return (input: Parameters<WebhookService['send']>[0]) => {
          // The url is never an attribute: it can carry a secret or a token.
          const boundary = startBoundarySpan(
            tracing,
            wire,
            'webhook.send',
            'producer',
            {
              'messaging.system': 'pikku',
              ...(input.event
                ? { 'messaging.destination.name': input.event }
                : {}),
            }
          )
          return endBoundaryWhenSettled(boundary, () =>
            target.send({
              ...input,
              traceparent: input.traceparent ?? boundary.traceparent,
            })
          )
        }
      }
      return passThrough(target, property)
    },
  })
