import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  CoreSingletonServices,
  PikkuRawWire,
} from '../../types/core.types.js'
import type { PikkuHTTP } from '../http/http.types.js'
import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { parseJson } from '../../utils.js'
import { PikkuFetchHTTPResponse } from '../http/pikku-fetch-http-response.js'
import { applyWebResponse } from '../http/web-request.js'
import {
  PikkuMissingMetaError,
  UnauthorizedError,
} from '../../errors/errors.js'
import {
  timingSafeStringEqual,
  verifyHmacSignature,
  verifyPublicKeySignature,
} from '../../utils/hmac.js'
import type {
  DeclaredTriggerSource,
  TriggerSourceRow,
  TriggerSourceStore,
} from '../../services/trigger-source-store.js'
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
  WebhookVerify,
} from './webhook-source.types.js'
import { webhookSecretCredentialName } from './webhook-source.types.js'

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
  data: unknown,
  wire: PikkuRawWire = {}
) =>
  runPikkuFunc<unknown, Out>('trigger', source, funcId, {
    singletonServices,
    auth: false,
    data: () => data,
    wire,
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

const signedWith = async (
  verify: WebhookVerify,
  request: WebhookRequest,
  secret: string,
  services: CoreSingletonServices
): Promise<boolean> => {
  if (typeof verify === 'function') {
    return await verify(request, secret, services)
  }
  const header = (name: string, prefix = '') => {
    const value = request.headers[name.toLowerCase()]
    return value?.startsWith(prefix) ? value.slice(prefix.length) : undefined
  }
  if ('hmac' in verify) {
    const {
      header: name,
      prefix,
      algorithm,
      encoding,
      secretEncoding,
    } = verify.hmac
    return verifyHmacSignature(
      secret,
      header(name, prefix),
      algorithm,
      request.body,
      encoding,
      secretEncoding
    )
  }
  if ('token' in verify) {
    const token = header(verify.token.header, verify.token.prefix)
    return !!token && timingSafeStringEqual(token, secret)
  }
  const { header: name, ...options } = verify.publicKey
  return verifyPublicKeySignature(secret, header(name), request.body, options)
}

/**
 * Whether the request was signed with the source's secret. A request with a
 * body is refused when it was not. A request without one — a HEAD probe, a
 * validation token in the query — only comes back unverified, so `receive`
 * can answer it but not dispatch from it. A source without `verify` checks in
 * its own `receive`.
 */
const verifyRequest = async (
  source: CoreTriggerWebhookSource | undefined,
  request: WebhookRequest,
  services: CoreSingletonServices
): Promise<boolean> => {
  if (!source?.verify) return true
  const bodiless = request.body.length === 0
  const secret = await services.credentialService?.get<string>(
    source.credential ?? webhookSecretCredentialName(source.name)
  )
  if (typeof secret !== 'string' || !secret) {
    if (bodiless) return false
    throw new UnauthorizedError(
      `The ${source.name} webhook source has no signing secret`
    )
  }
  const signed = await signedWith(
    source.verify,
    request,
    secret,
    services
  ).catch((error) => {
    if (bodiless) return false
    throw error
  })
  if (signed || bodiless) return signed
  throw new UnauthorizedError(`Invalid ${source.name} webhook signature`)
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
 * dropped, so the provider does not retry them forever. With a
 * `triggerSourceStore`, a source nobody enabled answers 404.
 */
export const receiveWebhookSourceRequest = async (
  sourceName: string,
  wire: { http?: PikkuHTTP }
): Promise<{ received: number } | void> => {
  const singletonServices = getSingletonServices()
  const meta = getSourceMeta(sourceName)
  const store = singletonServices.triggerSourceStore
  if (store && !(await store.getTriggerSource(sourceName))?.enabled) {
    wire.http?.response?.status(404)
    return
  }
  const source = pikkuState(null, 'trigger', 'webhookSources').get(sourceName)
  const request = await readRequest(wire.http)
  // A HEAD is a provider checking the URL is live. It carries no events, so
  // it is answered here rather than in every source's `receive`.
  if (request.method.toLowerCase() === 'head') {
    wire.http?.response?.status(200)
    return
  }
  const verified = await verifyRequest(source, request, singletonServices)

  // What `receive` writes to `http.response` is buffered and sent only when it
  // returns nothing, so a handshake answers in whatever shape the provider
  // wants without each adapter's write order getting in the way.
  const response = new PikkuFetchHTTPResponse()
  const result: WebhookReceiveResult | void = meta.receive
    ? await runSourceStep<WebhookReceiveResult | void>(
        singletonServices,
        sourceName,
        meta.receive,
        request,
        { http: { request: wire.http!.request, response } }
      )
    : {
        events: [
          {
            name: '',
            data: request.body.length ? parseJson(request.body) : undefined,
          },
        ],
      }

  if (!result) {
    if (wire.http?.response) {
      await applyWebResponse(wire.http.response, response.toResponse())
    }
    return
  }
  if (!verified && result.events.length > 0) {
    throw new UnauthorizedError(
      `The ${sourceName} webhook source received events in an unsigned request`
    )
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
  instructions?: string
  error?: string
}

type LifecycleInput = {
  /** Where the app's routes are served, e.g. `https://shop.example.com/api`. */
  baseUrl: string
  labelPrefix: string
}

const sourceAddress = (
  meta: WebhookSourceMeta,
  { baseUrl, labelPrefix }: LifecycleInput
) => ({
  url: `${baseUrl.replace(/\/+$/, '')}${meta.route}`,
  label: `${labelPrefix}:${meta.name}`,
})

const runSourceLifecycleStep = async (
  meta: WebhookSourceMeta,
  action: 'check' | 'setup' | 'teardown',
  lifecycleInput: LifecycleInput,
  previous: WebhookSourceState | undefined,
  singletonServices: CoreSingletonServices
): Promise<WebhookSourceOutcome> => {
  const { url, label } = sourceAddress(meta, lifecycleInput)
  const input = {
    url,
    label,
    events: subscribedWebhookEvents(meta.name),
    ...(previous ? { previous } : {}),
  }
  const outcome = (
    status: WebhookSourceOutcome['status'],
    extra = {}
  ): WebhookSourceOutcome => ({ source: meta.name, url, status, ...extra })

  try {
    if (action === 'teardown') {
      if (!meta.teardown) return outcome('skipped')
      const result = await runSourceStep<WebhookTeardownResult>(
        singletonServices,
        meta.name,
        meta.teardown,
        { label, ...(previous ? { previous } : {}) }
      )
      return outcome(result.status)
    }

    if (meta.check) {
      const checked = await runSourceStep<WebhookCheckResult>(
        singletonServices,
        meta.name,
        meta.check,
        input
      )
      if (action === 'check' || checked.status === 'ok') {
        return outcome(
          checked.status === 'ok' && action === 'setup'
            ? 'unchanged'
            : checked.status,
          checked.status === 'drifted' ? { reason: checked.reason } : {}
        )
      }
    } else if (action === 'check') {
      return outcome('skipped')
    }

    if (!meta.setup) {
      return outcome('manual', {
        instructions: `Register ${url} with the provider for: ${input.events.join(', ') || 'every event'}.`,
      })
    }
    const result = await runSourceStep<WebhookSetupResult>(
      singletonServices,
      meta.name,
      meta.setup,
      input
    )
    if (result.status === 'manual') {
      return outcome('manual', { instructions: result.instructions })
    }
    return outcome(result.status, result.state ? { state: result.state } : {})
  } catch (error) {
    return outcome('failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Runs one lifecycle step for every webhook source, as `pikku webhooks
 * status | setup | teardown` does. `setup` runs only where `check` does not
 * report `ok`. One failing source does not stop the rest.
 */
export const runWebhookSourceLifecycle = async ({
  action,
  previous = {},
  singletonServices = getSingletonServices(),
  ...input
}: LifecycleInput & {
  action: 'check' | 'setup' | 'teardown'
  /** What the last `setup` returned as `state`, by source name. */
  previous?: Record<string, WebhookSourceState>
  singletonServices?: CoreSingletonServices
}): Promise<WebhookSourceOutcome[]> => {
  const outcomes: WebhookSourceOutcome[] = []
  for (const meta of Object.values(
    pikkuState(null, 'trigger', 'webhookSourceMeta')
  )) {
    outcomes.push(
      await runSourceLifecycleStep(
        meta,
        action,
        input,
        previous[meta.name],
        singletonServices
      )
    )
  }
  return outcomes
}

const requireTriggerSourceStore = (
  singletonServices: CoreSingletonServices
) => {
  const store = singletonServices.triggerSourceStore
  if (!store) {
    throw new Error('No triggerSourceStore is configured')
  }
  return store
}

/** The trigger sources this app declares, as the store is synced to. */
export const declaredTriggerSources = (
  address?: LifecycleInput
): DeclaredTriggerSource[] =>
  Object.keys(pikkuState(null, 'trigger', 'webhookSourceMeta')).map((name) => ({
    name,
    kind: 'webhook',
    ...address,
  }))

const detailOf = (outcome: WebhookSourceOutcome) =>
  outcome.instructions ?? outcome.error ?? outcome.reason ?? null

const registerTriggerSource = async (
  store: TriggerSourceStore,
  meta: WebhookSourceMeta,
  input: LifecycleInput,
  previous: WebhookSourceState | undefined,
  singletonServices: CoreSingletonServices
) => {
  const outcome = await runSourceLifecycleStep(
    meta,
    'setup',
    input,
    previous,
    singletonServices
  )
  await store.recordTriggerSource(meta.name, {
    status: outcome.status,
    ...(outcome.state ? { state: outcome.state } : {}),
    detail: detailOf(outcome),
  })
  return outcome
}

/**
 * Registers every enabled webhook source with its provider: `check`, then
 * `setup` where it is missing or drifted, recording what was registered.
 * A source nobody enabled is skipped. Run after a deployment goes live.
 */
export const reconcileTriggerSources = async ({
  singletonServices = getSingletonServices(),
  ...input
}: LifecycleInput & {
  singletonServices?: CoreSingletonServices
}): Promise<WebhookSourceOutcome[]> => {
  const store = requireTriggerSourceStore(singletonServices)
  await store.syncTriggerSources(
    declaredTriggerSources({
      baseUrl: input.baseUrl,
      labelPrefix: input.labelPrefix,
    })
  )
  const outcomes: WebhookSourceOutcome[] = []
  for (const meta of Object.values(
    pikkuState(null, 'trigger', 'webhookSourceMeta')
  )) {
    const row = await store.getTriggerSource(meta.name)
    if (!row?.enabled) {
      outcomes.push({
        source: meta.name,
        url: sourceAddress(meta, input).url,
        status: 'skipped',
        reason: 'disabled',
      })
      continue
    }
    outcomes.push(
      await registerTriggerSource(
        store,
        meta,
        input,
        row.state ?? undefined,
        singletonServices
      )
    )
  }
  return outcomes
}

type SwitchInput = Partial<LifecycleInput> & {
  name: string
  singletonServices?: CoreSingletonServices
}

/** The address given, or the one the last deployment synced onto the row. */
const switchAddress = (
  row: TriggerSourceRow | null,
  { baseUrl, labelPrefix, name }: SwitchInput
): LifecycleInput => {
  const address = {
    baseUrl: baseUrl ?? row?.baseUrl,
    labelPrefix: labelPrefix ?? row?.labelPrefix,
  }
  if (!address.baseUrl || !address.labelPrefix) {
    throw new Error(
      `Trigger source '${name}' has no address yet: pass baseUrl and labelPrefix, or deploy so reconcile records them.`
    )
  }
  return address as LifecycleInput
}

/**
 * Turns a declared webhook source on and registers it with its provider, at
 * the address given or the one the last deployment recorded.
 */
export const enableTriggerSource = async ({
  singletonServices = getSingletonServices(),
  ...input
}: SwitchInput): Promise<WebhookSourceOutcome> => {
  const store = requireTriggerSourceStore(singletonServices)
  const meta = getSourceMeta(input.name)
  await store.syncTriggerSources(declaredTriggerSources())
  const row = await store.getTriggerSource(input.name)
  const address = switchAddress(row, input)
  await store.setTriggerSourceEnabled(input.name, true)
  return registerTriggerSource(
    store,
    meta,
    address,
    row?.state ?? undefined,
    singletonServices
  )
}

/**
 * Turns a webhook source off: it stops receiving at once, then is removed
 * from its provider. A failed teardown leaves it off and records the error.
 */
export const disableTriggerSource = async ({
  singletonServices = getSingletonServices(),
  ...input
}: SwitchInput): Promise<WebhookSourceOutcome> => {
  const store = requireTriggerSourceStore(singletonServices)
  const meta = getSourceMeta(input.name)
  const row = await store.getTriggerSource(input.name)
  const address = switchAddress(row, input)
  await store.setTriggerSourceEnabled(input.name, false)
  const outcome = await runSourceLifecycleStep(
    meta,
    'teardown',
    address,
    row?.state ?? undefined,
    singletonServices
  )
  await store.recordTriggerSource(input.name, {
    status: outcome.status,
    ...(outcome.status === 'failed' ? {} : { state: null }),
    detail: detailOf(outcome),
  })
  return outcome
}

/** What one source registered with its provider, as a caller keeps it between runs. */
export type WebhookRegistration = {
  url: string
  events: string[]
  status: WebhookSourceOutcome['status']
  state?: WebhookSourceState
  /** The signing secrets `setup` stored, so a wiped credential store can be refilled without registering again. */
  credentials?: Record<string, unknown>
}

export type WebhookRegistrations = Record<string, WebhookRegistration>

export type OrphanedWebhookRegistration = {
  source: string
  url: string
  label: string
}

/** The singleton credentials the package owning a source's `setup` declares: where its signing secret goes. */
const sourceCredentialNames = (meta: WebhookSourceMeta): string[] => {
  if (!meta.setup) return []
  const namespace = meta.setup.includes(':') ? meta.setup.split(':')[0]! : ''
  const packageName =
    pikkuState(null, 'addons', 'packages').get(namespace)?.package ?? null
  const declared = pikkuState(packageName, 'package', 'credentialsMeta') ?? {}
  return Object.entries(declared)
    .filter(
      ([, credential]) => credential.type === 'singleton' && !credential.oauth2
    )
    .map(([name]) => name)
}

const sameEvents = (a: string[], b: string[]) =>
  a.length === b.length && a.every((event) => b.includes(event))

/**
 * Registers every declared webhook source against registrations the caller
 * keeps rather than a `triggerSourceStore`, as `pikku dev` does in a file that
 * outlives its database. A source whose url and events match what was
 * registered is left alone without calling the provider, and its signing
 * secrets are put back if the credential store lost them. Registrations no
 * source declares any more are returned as orphans and kept, since only the
 * code that set one up could tear it down.
 */
export const reconcileWebhookRegistrations = async ({
  registrations,
  singletonServices = getSingletonServices(),
  ...input
}: LifecycleInput & {
  registrations: WebhookRegistrations
  singletonServices?: CoreSingletonServices
}): Promise<{
  registrations: WebhookRegistrations
  outcomes: WebhookSourceOutcome[]
  orphans: OrphanedWebhookRegistration[]
}> => {
  const credentialService = singletonServices.credentialService
  const sources = pikkuState(null, 'trigger', 'webhookSourceMeta')
  const next: WebhookRegistrations = {}
  const outcomes: WebhookSourceOutcome[] = []

  for (const meta of Object.values(sources)) {
    const { url } = sourceAddress(meta, input)
    const events = subscribedWebhookEvents(meta.name)
    const previous = registrations[meta.name]
    const names = sourceCredentialNames(meta)

    if (credentialService) {
      for (const [name, value] of Object.entries(previous?.credentials ?? {})) {
        if (!(await credentialService.has(name))) {
          await credentialService.set(name, value)
        }
      }
    }

    if (
      previous &&
      previous.status !== 'failed' &&
      previous.url === url &&
      sameEvents(previous.events, events)
    ) {
      next[meta.name] = previous
      outcomes.push({ source: meta.name, url, status: 'unchanged' })
      continue
    }

    const outcome = await runSourceLifecycleStep(
      meta,
      'setup',
      input,
      previous?.state,
      singletonServices
    )
    const credentials: Record<string, unknown> = {}
    for (const name of names) {
      const value = await credentialService?.get(name)
      if (value != null) credentials[name] = value
    }
    const state = outcome.state ?? previous?.state
    next[meta.name] = {
      url,
      events,
      status: outcome.status,
      ...(state ? { state } : {}),
      ...(Object.keys(credentials).length ? { credentials } : {}),
    }
    outcomes.push(outcome)
  }

  const orphans: OrphanedWebhookRegistration[] = []
  for (const [source, registration] of Object.entries(registrations)) {
    if (sources[source]) continue
    next[source] = registration
    orphans.push({
      source,
      url: registration.url,
      label: `${input.labelPrefix}:${source}`,
    })
  }

  return { registrations: next, outcomes, orphans }
}

/**
 * Removes the named webhook sources from their providers and forgets them.
 * Run on the outgoing deployment for the sources the next release drops,
 * since only the code that set a source up can tear it down.
 */
export const teardownTriggerSources = async ({
  names,
  singletonServices = getSingletonServices(),
  ...input
}: LifecycleInput & {
  names: string[]
  singletonServices?: CoreSingletonServices
}): Promise<WebhookSourceOutcome[]> => {
  const store = requireTriggerSourceStore(singletonServices)
  const outcomes: WebhookSourceOutcome[] = []
  for (const name of names) {
    const meta = getSourceMeta(name)
    const row = await store.getTriggerSource(name)
    const outcome = await runSourceLifecycleStep(
      meta,
      'teardown',
      input,
      row?.state ?? undefined,
      singletonServices
    )
    if (outcome.status === 'failed') {
      if (row) {
        await store.recordTriggerSource(name, {
          status: 'failed',
          detail: detailOf(outcome),
        })
      }
    } else {
      await store.deleteTriggerSource(name)
    }
    outcomes.push(outcome)
  }
  return outcomes
}
