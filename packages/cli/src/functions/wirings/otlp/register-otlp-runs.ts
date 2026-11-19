import { pikkuState } from '@pikku/core/state'
import type { FunctionsMeta, Logger } from '@pikku/core/services'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ScopeDefinitions } from '@pikku/core/scope'
import type { ScopeNodeMeta } from '@pikku/core/scope'
import type { OtlpSinkRegistry } from '@pikku/core/otlp'
import cliFunctionsMeta from '../../../../.pikku/function/pikku-functions-meta.gen.json' with { type: 'json' }
import cliHttpMeta from '../../../../.pikku/http/pikku-http-wirings-meta.gen.json' with { type: 'json' }
import {
  otlpRunsScopeDefinition,
  registerOtlpLive,
  type OtlpLive,
} from '@pikku/core/otlp/runs'

export const OTLP_RUNS_SNAPSHOT_ROUTE = '/otlp/runs/snapshot'
export const OTLP_RUNS_STREAM_ROUTE = '/otlp/runs/stream'

const FUNCTION_IDS = ['pikkuOtlpRunsSnapshot', 'pikkuOtlpRunsSubscribe']

let current: OtlpLive | undefined

/** The live feed of this process, set by `registerOtlpRuns`; undefined where the feed is off. */
export const getOtlpRuns = (): OtlpLive | undefined => current

/** Adds the nodes of `from` that `into` lacks, at every depth, keeping what `into` declares. */
const mergeMissingNodes = (
  into: Record<string, ScopeNodeMeta> | undefined,
  from: Record<string, ScopeNodeMeta> | undefined
): Record<string, ScopeNodeMeta> | undefined => {
  if (!from) return into
  const merged = { ...into }
  for (const [name, node] of Object.entries(from)) {
    const own = merged[name]
    merged[name] = own
      ? { ...own, scopes: mergeMissingNodes(own.scopes, node.scopes) }
      : node
    if (merged[name].scopes === undefined) delete merged[name].scopes
  }
  return merged
}

/**
 * The scope tree `registerOtlpRuns` gates on, added to every scope list the
 * project's generated types, meta and syncs are built from. Core owns the
 * `pikku` root: a project that declares its own keeps it and every child it
 * declared, gains the nodes it lacks, and gets no second root.
 */
export const withOtlpRunsScope = (
  scopes: ScopeDefinitions
): ScopeDefinitions => {
  const core = otlpRunsScopeDefinition()
  if (!scopes.some((scope) => scope.name === core.name))
    return [...scopes, core]
  return scopes.map((scope) =>
    scope.name === core.name
      ? { ...scope, scopes: mergeMissingNodes(scope.scopes, core.scopes) }
      : scope
  )
}

/**
 * A project's generated meta replaces the CLI's own when it loads, which takes
 * the meta of the routes in `otlp-runs.wiring.ts` with it. Puts the CLI's
 * generated entries for them back, leaving anything the project declares.
 */
const restoreGeneratedMeta = (): void => {
  const functions = pikkuState(null, 'function', 'meta') as FunctionsMeta
  for (const id of FUNCTION_IDS) {
    const generated = (cliFunctionsMeta as unknown as FunctionsMeta)[id]
    if (generated && !functions[id]) functions[id] = generated
  }
  const http = pikkuState(null, 'http', 'meta') as HTTPWiringsMeta
  const generated = (cliHttpMeta as unknown as HTTPWiringsMeta).get ?? {}
  for (const route of [OTLP_RUNS_SNAPSHOT_ROUTE, OTLP_RUNS_STREAM_ROUTE]) {
    if (generated[route] && !http.get[route]) http.get[route] = generated[route]
  }
}

/**
 * Starts the live runs feed of this process and makes it the one the routes in
 * `otlp-runs.wiring.ts` serve. Those routes answer 404 until this has run, so
 * the callers decide whether a process has a feed at all.
 *
 * It is called from the commands rather than generated into the project: an app
 * bootstrap is what a deployed bundle imports, and a data surface over a
 * process's own traces has no business in one. Call it again after the
 * generated meta is reloaded. The listener is made once per sink registry.
 */
export const registerOtlpRuns = (options: {
  otlpSinks: OtlpSinkRegistry
  eventHub: { publish(topic: string, data: unknown): Promise<void> }
  serviceName: string
  logger?: Pick<Logger, 'warn'>
}): OtlpLive => {
  const live = registerOtlpLive({
    otlpSinks: options.otlpSinks,
    serviceName: options.serviceName,
    logger: options.logger,
    publish: (topic, batch) => options.eventHub.publish(topic, batch),
  })

  const served: OtlpLive = {
    ...live,
    close: () => {
      if (current === served) current = undefined
      live.close()
    },
  }
  current = served
  restoreGeneratedMeta()
  return served
}
