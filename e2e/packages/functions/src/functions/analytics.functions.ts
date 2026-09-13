import { pikkuSessionlessFunc } from '#pikku/function'

/** One recorded event, flattened to what a scenario can assert on. */
type RecordedEvent = {
  name: string
  source: 'server' | 'client'
  props?: Record<string, unknown>
  functionId?: string
  traceId?: string
  userId?: string | null
  anonymousId?: string
}

/**
 * What the destinations have seen, for a scenario to assert against.
 *
 * `all` is everything the app emitted; `conversions` is what survived the
 * fan-out's `accepts` predicate. Reading both in one call is what makes the
 * predicate testable — the difference between the two lists is the policy.
 *
 * The buffer flushes when the invocation that filled it ends, so a scenario
 * reads this in a *later* request than the one it is asserting about. Reading
 * it in the same one would see nothing and prove nothing.
 */
export const readAnalytics = pikkuSessionlessFunc<
  void,
  { all: RecordedEvent[]; conversions: RecordedEvent[] }
>({
  expose: true,
  func: async ({ analyticsRecorder, analyticsConversions }) => {
    const flatten = (records: ReturnType<typeof analyticsRecorder.read>) =>
      records.map((record) => ({
        name: record.name,
        source: record.source,
        props: record.props,
        functionId: record.functionId,
        traceId: record.traceId,
        userId: record.userIdentity.userId,
        anonymousId: record.userIdentity.anonymousId,
      }))

    return {
      all: flatten(analyticsRecorder.read()),
      conversions: flatten(analyticsConversions.read()),
    }
  },
})

/** Empties both destinations, so one scenario's events are not another's. */
export const resetAnalytics = pikkuSessionlessFunc<void, { cleared: true }>({
  expose: true,
  func: async ({ analyticsRecorder, analyticsConversions }) => {
    analyticsRecorder.clear()
    analyticsConversions.clear()
    return { cleared: true }
  },
})
