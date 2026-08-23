/**
 * Fabric-injected product-analytics forwarder. The deploy container drops this
 * file into the user's `packages/functions/src/__fabric_analytics__/` before
 * `pikku bootstrap` runs, overwriting the copy that ships in the template. The
 * template's copy exists only so the app typechecks and runs locally; fabric
 * owns the deployed one so the transport can change without touching anyone's
 * repo.
 *
 * Unlike `__fabric_telemetry__` this is NOT middleware — there is no invocation
 * to wrap. The template's `/analytics` ingest function calls it with the events
 * it accepted and the identity it resolved from the session.
 *
 * Transport mirrors the telemetry middleware exactly:
 *
 *   - CF Worker  → `console.log(JSON.stringify(record))` → tail worker → OO
 *   - container  → `queueService.add('fabric-telemetry', …)` → backend → OO
 *
 * If FABRIC_STREAM_CLASS is unset (local dev, or an un-injected build) this
 * no-ops, so nothing has to branch on the environment at the call site.
 */

import type { SingletonServices } from '#pikku/function'

/**
 * The stream every analytics row is written to. This is a *stream name*, not a
 * stage class: analytics from every stage share one stream so it can carry its
 * own retention. Must match `ANALYTICS_STREAM` in the backend's
 * `lib/telemetry-stream.ts` and the tail worker's local copy — the forwarder
 * stamps it and both consumers route on it.
 */
const ANALYTICS_STREAM = 'analytics'

/** How far a browser-supplied timestamp may sit from server time before we distrust it. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export interface AnalyticsEventInput {
  /** Registry event name, e.g. `checkout_completed`. */
  name: string
  /** Flat, event-specific payload. */
  props?: Record<string, unknown>
  /** When the event happened in the browser, epoch ms. Server time is used if absent or implausible. */
  at?: number
}

export interface AnalyticsIdentity {
  /**
   * The signed-in user, resolved server-side from the session. Never sent by
   * the browser — an ingest that accepted a body-supplied user id would let any
   * visitor attribute events to anyone.
   */
  userId: string | null
}

/**
 * Forward accepted analytics events to the org's OpenObserve `analytics`
 * stream. Best-effort by construction: analytics is lossy-tolerant and must
 * never turn into a user-visible failure, so nothing here throws.
 */
export async function forwardAnalyticsEvents(
  {
    variables,
    queueService,
  }: Pick<SingletonServices, 'variables' | 'queueService'>,
  events: AnalyticsEventInput[],
  identity: AnalyticsIdentity
): Promise<void> {
  if (events.length === 0) return

  const streamClass = variables?.get?.('FABRIC_STREAM_CLASS') as
    string | undefined
  if (!streamClass) return

  const orgId = variables?.get?.('FABRIC_ORG_ID') as string | undefined
  const stageId = variables?.get?.('FABRIC_STAGE_ID') as string | undefined
  const stageShortId = variables?.get?.('FABRIC_STAGE_SHORT_ID') as
    string | undefined
  const stageType = variables?.get?.('FABRIC_STAGE_TYPE') as string | undefined
  const branch = variables?.get?.('FABRIC_BRANCH') as string | undefined
  const projectId = variables?.get?.('FABRIC_PROJECT_ID') as string | undefined
  const deploymentId = variables?.get?.('FABRIC_DEPLOYMENT_ID') as
    string | undefined
  const viaQueue =
    (variables?.get?.('FABRIC_TELEMETRY_QUEUE') as string | undefined) != null

  const now = Date.now()
  const identityKind = identity.userId ? 'user' : 'none'

  const records = events.map((event) => {
    // A browser clock that is wrong (or lying) would drop the row into the
    // wrong day bucket in the rollup, so an implausible timestamp is replaced
    // rather than trusted.
    const at =
      typeof event.at === 'number' &&
      Math.abs(now - event.at) <= MAX_CLOCK_SKEW_MS
        ? event.at
        : now
    return {
      // OpenObserve reads `_timestamp` in MICROseconds; the wire carries ms.
      _timestamp: at * 1000,
      // Props go first so a reserved field can never be clobbered by a
      // customer-declared one. Flat rather than nested because the drill-down
      // view queries them as columns.
      ...(event.props ?? {}),
      __pikku_telemetry: true,
      streamclass: ANALYTICS_STREAM,
      type: 'analytics',
      name: event.name,
      identitykind: identityKind,
      userid: identity.userId,
      orgid: orgId,
      stageid: stageId,
      stageshortid: stageShortId,
      stagetype: stageType,
      branch,
      projectid: projectId,
      deploymentid: deploymentId,
    }
  })

  if (viaQueue && queueService) {
    try {
      await queueService.add('fabric-telemetry', records)
    } catch (err) {
      console.error(
        `fabric-analytics: enqueue failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    return
  }

  for (const record of records) {
    console.log(JSON.stringify(record))
  }
}
