import assert from 'node:assert/strict'
import { parseTraceparent, type TraceContext } from '../../trace.js'
import {
  inboundContinues,
  type Instance,
  type TraceChain,
} from './chain-harness.js'
import { outcomeError } from './workflow-cases.js'

const TRACE_ID = /^[0-9a-f]{32}$/
const SPAN_ID = /^[0-9a-f]{16}$/

const assertWellFormed = (trace: TraceContext, label: string) => {
  assert.match(trace.traceId, TRACE_ID, label)
  assert.match(trace.spanId, SPAN_ID, label)
}

const assertUniqueSpans = (traces: TraceContext[], label: string) => {
  const spans = traces.map((trace) => trace.spanId)
  assert.equal(new Set(spans).size, spans.length, `${label}: spans repeat`)
}

/** Steps and compensations of one run, from the harness's record. */
const stepTraces = (chain: TraceChain, { index }: Instance) =>
  chain.h.traces
    .filter(({ rpc }) => new RegExp(`-${index}(:compensate)?$`).test(rpc))
    .map(({ trace }) => trace as TraceContext)

const assertEntry = (chain: TraceChain, instance: Instance) => {
  const { start } = chain.combo
  const inbound = chain.inbound
  const sent = parseTraceparent(instance.sent)
  const continues = inboundContinues(start, inbound) && !chain.meshGuardsEntry
  for (const entry of instance.entries) {
    assertWellFormed(entry, 'entry')
    if (continues) {
      assert.equal(entry.traceId, sent!.traceId, 'the trace was not continued')
      // Parsing names the sender's span as the parent of what comes next.
      const parent = instance.caller?.spanId ?? sent!.parentSpanId
      assert.equal(entry.parentSpanId, parent, 'wrong parent span')
      assert.notEqual(entry.spanId, parent, 'no new span')
    } else {
      if (sent) {
        assert.notEqual(entry.traceId, sent.traceId, 'adopted an untrusted id')
      }
      // These hold a root span of their own and call the function from it.
      if (!['channel', 'agent-tool', 'trigger'].includes(start)) {
        assert.equal(entry.parentSpanId, undefined, 'a root has no parent')
      }
    }
  }
  assertUniqueSpans(instance.entries, 'entry')
  // A job with no valid trace has none to keep: each delivery starts one, as
  // `runQueueJob` documents. A trace a job does carry survives every delivery.
  if (continues) {
    const ids = new Set(instance.entries.map((entry) => entry.traceId))
    assert.ok(ids.size <= 1, 'redelivery changed the trace')
  }
}

const assertHops = (chain: TraceChain, instance: Instance) => {
  const entries = instance.entries
  const parents = new Map(entries.map((entry) => [entry.spanId, entry]))
  for (const relay of instance.relays) {
    const parent = parents.get(relay.parentSpanId!)
    assert.ok(parent, `a relay hangs off ${relay.parentSpanId}`)
    parents.set(relay.spanId, parent)
  }
  for (const target of instance.targets) {
    assertWellFormed(target, 'target')
    const parent = parents.get(target.parentSpanId!)
    assert.ok(
      parent,
      `wrong parent: ${target.parentSpanId} is none of ${[...parents.keys()]}`
    )
    assert.equal(target.traceId, parent.traceId, 'the hop changed the trace')
    assert.ok(!parents.has(target.spanId), 'the hop kept the span')
  }
  assertUniqueSpans(instance.targets, 'target')
  for (const outgoing of instance.outgoing) {
    const parsed = parseTraceparent(outgoing)
    assert.ok(parsed, `invalid outgoing traceparent ${outgoing}`)
    assert.ok(
      entries.some((entry) => entry.traceId === parsed.traceId),
      'the wire carries another trace'
    )
  }
}

const assertRun = async (chain: TraceChain, instance: Instance) => {
  if (!instance.runId) return
  const run = await chain.h.run(instance.runId)
  const stored = parseTraceparent(run.wire.traceparent)
  assert.ok(stored, 'the run lost its stored trace')
  // A redelivered entry starts a run per delivery; each hangs off its own.
  const starter = (span?: string) =>
    instance.entries.find((entry) => entry.spanId === span)
  const entry = starter(stored.parentSpanId)
  assert.ok(entry, 'the run stored another span')
  assert.equal(stored.traceId, entry.traceId, 'the run stored another trace')
  const steps = stepTraces(chain, instance)
  for (const step of steps) {
    assert.ok(step, 'a step ran with no trace')
    const parent = starter(step.parentSpanId)
    assert.ok(parent, 'steps hang off the start')
    assert.equal(step.traceId, parent.traceId, 'a step left the trace')
  }
  assertUniqueSpans(steps, 'step')
  for (const job of chain.h.jobTraceparents) {
    const parsed = parseTraceparent(job)
    assert.ok(parsed, 'a workflow job lost its trace')
  }
}

/** The instance's trace id, wherever the chain got far enough to show it. */
const traceOf = (chain: TraceChain, instance: Instance) =>
  instance.entries[0]?.traceId ??
  instance.errorId ??
  chain.logs.find(({ level, scope }) => level === 'error' && scope)?.scope

const assertFailure = (chain: TraceChain, instance: Instance) => {
  const { start, hop, outcome } = chain.combo
  const traceId = traceOf(chain, instance)
  assert.ok(traceId, 'the chain never showed a trace')
  if (['http', 'channel', 'mcp'].includes(start) && instance.callerRefused) {
    assert.ok(instance.errorId, 'the caller was given no errorId')
  }
  if (instance.errorId) {
    assert.equal(instance.errorId, traceId, 'errorId is not the trace id')
  }
  if (hop === 'mesh' && instance.calleeErrorId && outcome !== 'auth-mesh-jwt') {
    assert.ok(
      instance.entries.some(({ traceId: id }) => id === instance.calleeErrorId),
      'the callee errorId differs'
    )
  }
}

/**
 * Every trace id the chain owns. A job refused before its function runs shows
 * no entry, so what it owns is the trace it carried, or else the one each
 * delivery started and logged under.
 */
const tracesOf = (chain: TraceChain) => {
  const carried = (instance: Instance) =>
    inboundContinues(chain.combo.start, chain.inbound) && !chain.meshGuardsEntry
      ? [parseTraceparent(instance.sent)?.traceId]
      : []
  const refused = chain.instances.some(({ entries }) => !entries.length)
  return new Set(
    chain.instances
      .flatMap((instance) => [
        traceOf(chain, instance),
        ...carried(instance),
        ...instance.entries.map((entry) => entry.traceId),
      ])
      .concat(refused ? chain.logs.map(({ scope }) => scope) : [])
  )
}

const assertLogs = (chain: TraceChain) => {
  const traces = tracesOf(chain)
  for (const { level, scope, message } of chain.logs) {
    if (level === 'error') {
      assert.ok(
        scope !== undefined,
        `an error logged with no trace: ${JSON.stringify(message)?.slice(0, 120)}`
      )
    }
    if (scope !== undefined && chain.combo.outcome !== 'auth-mesh-jwt') {
      assert.ok(traces.has(scope), `a log carries a stray trace ${scope}`)
    }
  }
}

const assertTelemetry = (chain: TraceChain) => {
  const seen = tracesOf(chain)
  for (const { message } of chain.logs) {
    const record = message as { __pikku_telemetry?: string; traceId?: string }
    if (!record?.__pikku_telemetry) continue
    assert.ok(
      seen.has(record.traceId!),
      `telemetry carries ${record.traceId}, not a trace of this chain`
    )
  }
}

/** Chains running at once must not share or swap anything. */
const assertIsolated = (chain: TraceChain) => {
  if (chain.instances.length < 2) return
  const owners = new Map<string | undefined, number>()
  const own = (traceId: string | undefined, index: number) => {
    const owner = owners.get(traceId) ?? index
    assert.equal(owner, index, 'two concurrent starts share a trace')
    owners.set(traceId, index)
  }
  for (const instance of chain.instances) {
    const { index, entries, targets, outgoing } = instance
    own(traceOf(chain, instance), index)
    for (const { traceId } of [...entries, ...targets]) own(traceId, index)
    for (const hop of outgoing) own(parseTraceparent(hop)?.traceId, index)
  }
}

/** What every generated test asserts about a chain, once it has run. */
export const assertChain = async (chain: TraceChain) => {
  for (const instance of chain.instances) {
    assertEntry(chain, instance)
    assertHops(chain, instance)
    await assertRun(chain, instance)
    if (outcomeError(chain.combo.outcome) || instance.failure) {
      assertFailure(chain, instance)
    }
    if (chain.timing === 'job-after-parent') {
      for (const startedAt of instance.targetStartedAt) {
        assert.ok(
          startedAt >= instance.entryFinishedAt!,
          'ran before the parent finished'
        )
      }
    }
  }
  assertLogs(chain)
  assertTelemetry(chain)
  assertIsolated(chain)
}
