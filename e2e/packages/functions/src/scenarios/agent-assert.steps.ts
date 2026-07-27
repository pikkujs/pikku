/**
 * Assertion steps for the deterministic agent scenarios.
 *
 * Every one takes the run result as explicit data rather than reaching back
 * into a shared world — which is what removes the five verbatim copies of
 * `callsFor(this.agentMessage!)` the cucumber glue carried.
 *
 * Naming: `expects*` compares values the scenario already holds and never
 * touches a DOM; `sees*` is reserved for browser-backed steps.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { MockLlmCall } from './agent-transport.js'

const describe = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value)

/**
 * Whether the run was refused.
 *
 * A refusal is not always a non-2xx — an agent permission that rejects before
 * the run starts answers 200 with an `errorId` — so both signals count, exactly
 * as the cucumber step did.
 */
export const expectsRunOutcome = pikkuScenarioStep<
  { run: { status: number; ok: boolean; error?: string }; refused: boolean },
  { status: number }
>({
  name: 'expectsRunOutcome',
  description: 'expects the run to be refused or to succeed',
  template: 'expects refused={refused}',
  func: async (_services, { run, refused }) => {
    const wasRefused = run.status >= 400 || Boolean(run.error)
    if (wasRefused !== refused) {
      throw new Error(
        refused
          ? `Expected a refusal, got ${run.status} (error: ${describe(run.error)})`
          : `Expected success, got ${run.status} (error: ${describe(run.error)})`
      )
    }
    return { status: run.status }
  },
})

export const expectsRunResult = pikkuScenarioStep<
  { run: { result: unknown }; equals: unknown },
  { matched: true }
>({
  name: 'expectsRunResult',
  description: 'expects the run result',
  func: async (_services, { run, equals }) => {
    if (JSON.stringify(run.result) !== JSON.stringify(equals)) {
      throw new Error(
        `Expected run result ${describe(equals)}, got ${describe(run.result)}`
      )
    }
    return { matched: true }
  },
})

export const expectsModelCallCount = pikkuScenarioStep<
  { calls: MockLlmCall[]; count: number },
  { count: number }
>({
  name: 'expectsModelCallCount',
  description: 'expects a number of model calls',
  template: 'expects {count} model call(s)',
  func: async (_services, { calls, count }) => {
    if (calls.length !== count) {
      throw new Error(
        `Expected ${count} model call(s), got ${calls.length}: ${calls
          .map((c) => c.userMessage)
          .join(' | ')}`
      )
    }
    return { count: calls.length }
  },
})

/**
 * What the model was allowed to see on one call.
 *
 * `pikkuAuth` is evaluated before the run starts, so a tool the caller fails is
 * filtered out of this list entirely and no model — cooperative or not — can
 * call it. That makes the offered list the only faithful assertion for auth
 * filtering, which is why `none` is a distinct case rather than an empty
 * `offered`.
 */
export const expectsOfferedTools = pikkuScenarioStep<
  {
    calls: MockLlmCall[]
    index: number
    offered?: string[]
    notOffered?: string[]
    none?: boolean
  },
  { toolNames: string[] }
>({
  name: 'expectsOfferedTools',
  description: 'expects which tools a model call was offered',
  template: 'expects call {index} tools',
  func: async (_services, { calls, index, offered, notOffered, none }) => {
    const call = calls[index - 1]
    if (!call) {
      throw new Error(
        `There is no model call ${index} — the run made ${calls.length}`
      )
    }
    const toolNames = call.toolNames ?? []

    if (none && toolNames.length > 0) {
      throw new Error(`Expected no tools, got ${toolNames.join(', ')}`)
    }
    for (const tool of offered ?? []) {
      if (!toolNames.includes(tool)) {
        throw new Error(
          `Expected call ${index} to be offered "${tool}", got ${toolNames.join(', ') || '(none)'}`
        )
      }
    }
    for (const tool of notOffered ?? []) {
      if (toolNames.includes(tool)) {
        throw new Error(
          `Expected call ${index} NOT to be offered "${tool}", got ${toolNames.join(', ')}`
        )
      }
    }
    return { toolNames }
  },
})

/**
 * What the tools actually returned, read off the model call that followed them.
 *
 * The run's own HTTP response says nothing about individual tool outcomes — a
 * refused tool does not fail the run — so the only faithful record of what
 * happened is what got replayed back into the next model call.
 *
 * A refused tool reports a generic failure rather than naming the permission:
 * telling the model (and so the user) which gate it hit would leak the rule. So
 * the assertion is only that the call failed, and the paired success scenario
 * is what proves the failure came from the gate and not from a broken tool.
 */
export const expectsToolResults = pikkuScenarioStep<
  {
    calls: MockLlmCall[]
    failed?: boolean
    contains?: string
    doesNotContain?: string
  },
  { results: number }
>({
  name: 'expectsToolResults',
  description: 'expects what the tools reported back to the model',
  func: async (_services, { calls, failed, contains, doesNotContain }) => {
    const followUp = calls[1]
    const results = (followUp?.messages ?? [])
      .filter((m: any) => m.role === 'tool')
      .flatMap((m: any) => (Array.isArray(m.content) ? m.content : [m.content]))

    if (results.length === 0) {
      throw new Error('No tool result was replayed to the model')
    }
    const serialized = JSON.stringify(results)

    if (failed !== undefined) {
      const looksFailed = /error|failed/.test(serialized.toLowerCase())
      if (looksFailed !== failed) {
        throw new Error(
          failed
            ? `Expected the tool call to be refused, got ${serialized}`
            : `Expected the tool call to succeed, got ${serialized}`
        )
      }
    }
    if (contains !== undefined && !serialized.includes(contains)) {
      throw new Error(
        `Expected the tool results to contain "${contains}", got ${serialized}`
      )
    }
    if (doesNotContain !== undefined && serialized.includes(doesNotContain)) {
      throw new Error(
        `Expected the tool results NOT to contain "${doesNotContain}", got ${serialized}`
      )
    }
    return { results: results.length }
  },
})
