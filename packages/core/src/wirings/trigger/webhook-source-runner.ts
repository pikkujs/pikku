import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  CoreSingletonServices,
  PikkuRawWire,
} from '../../types/core.types.js'
import type { PikkuHTTP } from '../http/http.types.js'
import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'
import type {
  CoreTriggerWebhookSource,
  TriggerEvent,
  WebhookCheckResult,
  WebhookReceiveResult,
  WebhookRequest,
  WebhookSetupResult,
  WebhookSourceJob,
  WebhookSourceMeta,
  WebhookSourceState,
  WebhookTeardownResult,
} from './webhook-source.types.js'

const LIFECYCLE = ['receive', 'check', 'setup', 'teardown'] as const

export const wireTriggerWebhookSource = <
  Events extends Record<string, StandardSchemaV1>,
>(
  source: CoreTriggerWebhookSource<Events>
) => {
  const meta = pikkuState(null, 'trigger', 'webhookSourceMeta')[source.name]
  if (!meta) {
    console.warn(
      `[pikku] Skipping webhook source '${source.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }
  const sources = pikkuState(null, 'trigger', 'webhookSources')
  if (sources.has(source.name)) {
    throw new Error(`Webhook source already exists: ${source.name}`)
  }
  sources.set(source.name, source as CoreTriggerWebhookSource)
  for (const step of LIFECYCLE) {
    const funcId = meta[step]
    const config = source[step]
    if (funcId && typeof (config as { func?: unknown })?.func === 'function') {
      addFunction(funcId, config!)
    }
  }
}

const triggerName = (source: string, event: string) =>
  event ? `${source}:${event}` : source

/** The declared events some trigger is wired to: what `setup` registers with the provider. */
export const subscribedWebhookEvents = (source: string): string[] => {
  const triggers = pikkuState(null, 'trigger', 'meta')
  const meta = pikkuState(null, 'trigger', 'webhookSourceMeta')[source]
  return (meta?.events ?? []).filter(
    (event) => triggers[triggerName(source, event)]
  )
}

const getSourceMeta = (source: string): WebhookSourceMeta => {
  const meta = pikkuState(null, 'trigger', 'webhookSourceMeta')[source]
  if (!meta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for webhook source '${source}'`
    )
  }
  return meta
}

const runSourceStep = <Out>(
  singletonServices: CoreSingletonServices,
  source: string,
  funcId: string,
  data: unknown
) =>
  runPikkuFunc<unknown, Out>('trigger', source, funcId, {
    singletonServices,
    auth: false,
    data: () => data,
    wire: {},
  })

const readRequest = async (http: PikkuHTTP | undefined) => {
  const request = http?.request
  if (!request) {
    throw new Error('A webhook source can only be reached over HTTP')
  }
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(request.query() ?? {})) {
    if (value !== undefined) query[key] = String(value)
  }
  return {
    body: new Uint8Array(await request.arrayBuffer()),
    headers: request.headers(),
    method: request.method(),
    url: request.path(),
    query,
  } satisfies WebhookRequest
}

const validateEvents = async (
  source: CoreTriggerWebhookSource | undefined,
  events: TriggerEvent[],
  logger: CoreSingletonServices['logger']
) => {
  const valid: TriggerEvent[] = []
  for (const event of events) {
    const schema = source?.events?.[event.name]
    if (!schema) {
      valid.push(event)
      continue
    }
    const result = await schema['~standard'].validate(event.data)
    if (result.issues) {
      logger.warn(
        `Webhook source '${source!.name}' dropped '${event.name}'${event.id ? ` (${event.id})` : ''}: ${result.issues.map((issue) => issue.message).join('; ')}`
      )
      continue
    }
    valid.push({ ...event, data: result.value })
  }
  return valid
}

/**
 * The body of a webhook source's route: `receive`, validate, and queue every
 * event some trigger listens for. Events nobody listens for are answered and
 * dropped, so the provider does not retry them forever.
 */
export const receiveWebhookSourceRequest = async (
  sourceName: string,
  wire: { http?: PikkuHTTP }
): Promise<Response | { received: number }> => {
  const singletonServices = getSingletonServices()
  const meta = getSourceMeta(sourceName)
  const source = pikkuState(null, 'trigger', 'webhookSources').get(sourceName)
  const request = await readRequest(wire.http)

  const result: WebhookReceiveResult = meta.receive
    ? await runSourceStep<WebhookReceiveResult>(
        singletonServices,
        sourceName,
        meta.receive,
        request
      )
    : {
        events: [
          {
            name: '',
            data: request.body.length
              ? JSON.parse(new TextDecoder().decode(request.body))
              : undefined,
          },
        ],
      }

  if ('respond' in result) {
    const { status, body, headers } = result.respond
    const text =
      body === undefined
        ? null
        : typeof body === 'string'
          ? body
          : JSON.stringify(body)
    return new Response(text, { status, headers })
  }

  const triggers = pikkuState(null, 'trigger', 'meta')
  const listened = result.events.filter(
    (event) => triggers[triggerName(sourceName, event.name)]
  )
  const events = await validateEvents(
    source,
    listened,
    singletonServices.logger
  )
  if (events.length === 0) return { received: 0 }

  const service = singletonServices.incomingWebhookService
  if (!service) {
    throw new Error(
      `Webhook source '${sourceName}' received events but no incomingWebhookService is configured to queue them.`
    )
  }
  return {
    received: await service.accept({ source: sourceName, request, events }),
  }
}

/** The `pikku-incoming-webhooks` worker: runs the trigger an event was queued for. Throws so the queue retries. */
export const dispatchWebhookSourceJob = async (
  job: WebhookSourceJob
): Promise<void> => {
  const singletonServices = getSingletonServices()
  const name = triggerName(job.source, job.event.name)
  const trigger = pikkuState(null, 'trigger', 'meta')[name]
  if (!trigger) {
    singletonServices.logger.warn(
      `No trigger named '${name}' is wired; dropping ${job.event.id ?? 'an event'} from '${job.source}'.`
    )
    return
  }

  let error: string | undefined
  try {
    await runPikkuFunc('trigger', name, trigger.pikkuFuncId, {
      singletonServices,
      auth: false,
      data: () => job.event.data,
      wire: {} as PikkuRawWire,
    })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    if (job.receiptId) {
      await recordAttempt(singletonServices, job.receiptId, name, error)
    }
    throw e
  }
  if (job.receiptId) {
    await recordAttempt(singletonServices, job.receiptId, name)
  }
}

const recordAttempt = (
  singletonServices: CoreSingletonServices,
  receiptId: string,
  trigger: string,
  error?: string
) =>
  singletonServices.incomingWebhookService
    ?.recordAttempt(receiptId, { trigger, ...(error ? { error } : {}) })
    .catch((storeError) =>
      singletonServices.logger.error(
        `Failed to record the attempt for webhook receipt ${receiptId}`,
        storeError
      )
    )

export type WebhookSourceOutcome = {
  source: string
  url: string
  status:
    | WebhookCheckResult['status']
    | WebhookSetupResult['status']
    | WebhookTeardownResult['status']
    | 'skipped'
    | 'failed'
  reason?: string
  state?: WebhookSourceState
  /** The name the produced signing secret must be stored under. */
  secretName?: string
  secret?: string
  instructions?: string
  error?: string
}

/**
 * Runs one lifecycle step for every webhook source, as `pikku webhooks
 * status | setup | teardown` does at deploy. `setup` runs only where `check`
 * does not report `ok`. One failing source does not stop the rest.
 */
export const runWebhookSourceLifecycle = async ({
  action,
  baseUrl,
  labelPrefix,
  previous = {},
  singletonServices = getSingletonServices(),
}: {
  action: 'check' | 'setup' | 'teardown'
  /** Where the app's routes are served, e.g. `https://shop.example.com/api`. */
  baseUrl: string
  labelPrefix: string
  /** What the last `setup` returned as `state`, by source name. */
  previous?: Record<string, WebhookSourceState>
  singletonServices?: CoreSingletonServices
}): Promise<WebhookSourceOutcome[]> => {
  const base = baseUrl.replace(/\/+$/, '')
  const outcomes: WebhookSourceOutcome[] = []
  for (const meta of Object.values(
    pikkuState(null, 'trigger', 'webhookSourceMeta')
  )) {
    const url = `${base}${meta.route}`
    const label = `${labelPrefix}:${meta.name}`
    const input = {
      url,
      label,
      events: subscribedWebhookEvents(meta.name),
      ...(previous[meta.name] ? { previous: previous[meta.name] } : {}),
    }
    const outcome = (status: WebhookSourceOutcome['status'], extra = {}) =>
      outcomes.push({ source: meta.name, url, status, ...extra })

    try {
      if (action === 'teardown') {
        if (!meta.teardown) {
          outcome('skipped')
          continue
        }
        const result = await runSourceStep<WebhookTeardownResult>(
          singletonServices,
          meta.name,
          meta.teardown,
          { label, ...(input.previous ? { previous: input.previous } : {}) }
        )
        outcome(result.status)
        continue
      }

      if (meta.check) {
        const checked = await runSourceStep<WebhookCheckResult>(
          singletonServices,
          meta.name,
          meta.check,
          input
        )
        if (action === 'check' || checked.status === 'ok') {
          outcome(
            checked.status === 'ok' && action === 'setup'
              ? 'unchanged'
              : checked.status,
            checked.status === 'drifted' ? { reason: checked.reason } : {}
          )
          continue
        }
      } else if (action === 'check') {
        outcome('skipped')
        continue
      }

      if (!meta.setup) {
        outcome('manual', {
          instructions: `Register ${url} with the provider for: ${input.events.join(', ') || 'every event'}.`,
        })
        continue
      }
      const result = await runSourceStep<WebhookSetupResult>(
        singletonServices,
        meta.name,
        meta.setup,
        input
      )
      if (result.status === 'manual') {
        outcome('manual', { instructions: result.instructions })
        continue
      }
      outcome(result.status, {
        ...(result.state ? { state: result.state } : {}),
        ...(result.secret && meta.secret
          ? { secretName: meta.secret, secret: result.secret }
          : {}),
      })
    } catch (error) {
      outcome('failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return outcomes
}
