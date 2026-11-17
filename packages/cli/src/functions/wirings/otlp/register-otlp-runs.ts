import { wireHTTP } from '@pikku/core/http'
import { pikkuState } from '@pikku/core/state'
import type { FunctionsMeta } from '@pikku/core/services'
import type { ScopeDefinitions } from '@pikku/core/scope'
import type { OtlpSinkRegistry } from '@pikku/core/otlp'
import {
  OTLP_RUNS_SCOPE,
  OTLP_RUNS_TOPIC,
  otlpRunsScopeDefinition,
  registerOtlpLive,
  type OtlpLive,
} from '@pikku/core/otlp/runs'

export const OTLP_RUNS_SNAPSHOT_ROUTE = '/otlp/runs/snapshot'
export const OTLP_RUNS_STREAM_ROUTE = '/otlp/runs/stream'

const SNAPSHOT_FUNC = 'pikkuOtlpRunsSnapshot'
const STREAM_FUNC = 'pikkuOtlpRunsSubscribe'

/**
 * The scope tree `registerOtlpRuns` gates on, added to the scopes a dev or
 * served process syncs. A project that declares an `otlp` root itself keeps its own.
 */
export const withOtlpRunsScope = (
  scopes: ScopeDefinitions
): ScopeDefinitions =>
  scopes.some((scope) => scope.name === 'otlp')
    ? scopes
    : [...scopes, otlpRunsScopeDefinition()]

/**
 * The live runs of this process: `GET /otlp/runs/snapshot` and the SSE stream
 * `GET /otlp/runs/stream`, both requiring `otlp:runs`.
 *
 * Registered here rather than generated into the project, as the scenario
 * instrumentation is: an app bootstrap is what a deployed bundle imports, and a
 * data surface over a process's own traces has no business in one. Call it again
 * after the generated meta is reloaded — a reload replaces the HTTP meta this
 * puts back. The listener is made once per sink registry.
 */
export const registerOtlpRuns = (options: {
  otlpSinks: OtlpSinkRegistry
  eventHub: { publish(topic: string, data: unknown): Promise<void> }
  serviceName: string
}): OtlpLive => {
  const live = registerOtlpLive({
    otlpSinks: options.otlpSinks,
    serviceName: options.serviceName,
    publish: (topic, batch) => options.eventHub.publish(topic, batch),
  })

  const meta = pikkuState(null, 'function', 'meta') as FunctionsMeta
  const common = {
    inputSchemaName: null,
    outputSchemaName: null,
    scopes: [OTLP_RUNS_SCOPE],
    tags: ['pikku'],
  }
  meta[SNAPSHOT_FUNC] = {
    ...common,
    pikkuFuncId: SNAPSHOT_FUNC,
    title: 'Live Runs Snapshot',
    description:
      'The open runs, the recent closed ones and the health window of this process, with the seq they reflect.',
  }
  meta[STREAM_FUNC] = {
    ...common,
    pikkuFuncId: STREAM_FUNC,
    subscribe: { topicPattern: OTLP_RUNS_TOPIC },
    title: 'Live Runs Stream',
    description:
      'Subscribes the stream to the live run events of this process.',
  }
  pikkuState(null, 'function', 'meta', meta)

  const httpMeta = pikkuState(null, 'http', 'meta')
  const route = (pikkuFuncId: string, path: string, sse?: true) => ({
    pikkuFuncId,
    route: path,
    method: 'get' as const,
    auth: true,
    requiresSession: true,
    tags: ['pikku'],
    ...(sse ? { sse } : {}),
  })
  httpMeta.get[OTLP_RUNS_SNAPSHOT_ROUTE] = route(
    SNAPSHOT_FUNC,
    OTLP_RUNS_SNAPSHOT_ROUTE
  )
  httpMeta.get[OTLP_RUNS_STREAM_ROUTE] = route(
    STREAM_FUNC,
    OTLP_RUNS_STREAM_ROUTE,
    true
  )

  wireHTTP({
    route: OTLP_RUNS_SNAPSHOT_ROUTE,
    method: 'get',
    auth: true,
    func: { func: async () => live.snapshot() },
  } as any)
  wireHTTP({
    route: OTLP_RUNS_STREAM_ROUTE,
    method: 'get',
    sse: true,
    auth: true,
    func: { func: async () => OTLP_RUNS_TOPIC },
  } as any)
  return live
}
