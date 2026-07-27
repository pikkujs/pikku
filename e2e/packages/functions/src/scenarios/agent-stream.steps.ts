/**
 * Steps for the agent's SSE surface.
 *
 * The cucumber glue passed a `StreamRecording` class between steps and called
 * `ofType`/`first`/`indexOf` on it. A step result has to be JSON, so the effect
 * step precomputes everything the assertions need — the ordered event types, the
 * concatenated text, the finished-run usage and the two correlated tool call ids
 * — and the ordering helpers become module-local functions here.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import {
  AG_UI,
  apiUrlOf,
  postAgentStream,
  type Identity,
  type StreamEvent,
} from './agent-transport.js'

export interface AgentStreamResult {
  status: number
  /** Every event type in the order it arrived — the basis of every assertion. */
  types: string[]
  /** The concatenated TEXT_MESSAGE_CONTENT deltas. */
  text: string
  totalTokens: number
  /** The first tool call's bracket id and the id its result carried. */
  toolCallId?: string
  toolResultId?: string
}

const firstOfType = (events: StreamEvent[], type: string) =>
  events.find((event) => event.type === type)

export const streamsAgent = pikkuScenarioStep<
  {
    agent: string
    script: string
    message: string
    threadId: string
    resourceId: string
    identity?: Identity
  },
  AgentStreamResult
>({
  name: 'streamsAgent',
  description: 'streams an agent',
  template: 'streams {agent} with {script}',
  func: async (
    _services,
    { agent, script, message, threadId, resourceId, identity },
    { scenarioStep }
  ) => {
    const { status, events } = await postAgentStream(
      apiUrlOf(scenarioStep.env),
      agent,
      identity ?? {},
      { message, threadId, resourceId, model: `mock/${script}` }
    )

    const usage = firstOfType(events, AG_UI.runFinished)?.usage as
      | { totalTokens?: number }
      | undefined

    return {
      status,
      types: events.map((event) => event.type),
      text: events
        .filter((event) => event.type === AG_UI.textContent)
        .map((event) => String(event.delta ?? ''))
        .join(''),
      totalTokens: usage?.totalTokens ?? 0,
      toolCallId: firstOfType(events, AG_UI.toolCallStart)?.toolCallId as
        | string
        | undefined,
      toolResultId: firstOfType(events, AG_UI.toolCallResult)?.toolCallId as
        | string
        | undefined,
    }
  },
})

/**
 * The run envelope: what the stream opens and closes with.
 *
 * Asserted as first and last rather than as membership, because a client that
 * renders on RUN_STARTED and tears down on RUN_FINISHED depends on the position,
 * not the presence.
 */
export const expectsStreamEnvelope = pikkuScenarioStep<
  { types: string[]; startsWith: string; endsWith: string },
  { events: number }
>({
  name: 'expectsStreamEnvelope',
  description: 'expects the stream to open and close with the run envelope',
  template: 'expects {startsWith} … {endsWith}',
  func: async (_services, { types, startsWith, endsWith }) => {
    if (types[0] !== startsWith) {
      throw new Error(
        `Expected the stream to start with ${startsWith}, got ${types[0] ?? '(empty)'}`
      )
    }
    const last = types[types.length - 1]
    if (last !== endsWith) {
      throw new Error(
        `Expected the stream to end with ${endsWith}, got ${last ?? '(empty)'}`
      )
    }
    return { events: types.length }
  },
})

export const expectsStreamEvents = pikkuScenarioStep<
  {
    types: string[]
    contains?: string[]
    counts?: Record<string, number>
  },
  { events: number }
>({
  name: 'expectsStreamEvents',
  description: 'expects which events the stream carried',
  func: async (_services, { types, contains, counts }) => {
    for (const type of contains ?? []) {
      if (!types.includes(type)) {
        throw new Error(
          `Expected the stream to contain ${type}, got ${types.join(', ') || '(no events)'}`
        )
      }
    }
    for (const [type, expected] of Object.entries(counts ?? {})) {
      const actual = types.filter((seen) => seen === type).length
      if (actual !== expected) {
        throw new Error(`Expected ${expected} ${type} event(s), got ${actual}`)
      }
    }
    return { events: types.length }
  },
})

export const expectsStreamOrder = pikkuScenarioStep<
  { types: string[]; before: string; after: string },
  { ordered: true }
>({
  name: 'expectsStreamOrder',
  description: 'expects one event to precede another',
  template: 'expects {before} before {after}',
  func: async (_services, { types, before, after }) => {
    const beforeIndex = types.indexOf(before)
    const afterIndex = types.indexOf(after)
    if (beforeIndex < 0) {
      throw new Error(`${before} is missing from the stream`)
    }
    if (afterIndex < 0) {
      throw new Error(`${after} is missing from the stream`)
    }
    if (beforeIndex >= afterIndex) {
      throw new Error(
        `Expected ${before} (at ${beforeIndex}) to precede ${after} (at ${afterIndex})`
      )
    }
    return { ordered: true }
  },
})

export const expectsStreamText = pikkuScenarioStep<
  { text: string; equals: unknown },
  { text: string }
>({
  name: 'expectsStreamText',
  description: 'expects the streamed text',
  func: async (_services, { text, equals }) => {
    if (text !== equals) {
      throw new Error(
        `Expected the streamed text to be ${JSON.stringify(equals)}, got ${JSON.stringify(text)}`
      )
    }
    return { text }
  },
})

/**
 * A tool call and its result must carry the same id.
 *
 * Without it a client cannot attach a result to the call it renders, so this is
 * the one assertion that makes the bracketing events usable rather than decorative.
 */
export const expectsToolCallCorrelation = pikkuScenarioStep<
  { toolCallId?: string; toolResultId?: string },
  { toolCallId: string }
>({
  name: 'expectsToolCallCorrelation',
  description: 'expects a tool call and its result to share an id',
  func: async (_services, { toolCallId, toolResultId }) => {
    if (!toolCallId) {
      throw new Error('The stream carried no tool call id')
    }
    if (toolResultId !== toolCallId) {
      throw new Error(
        `Expected the tool result to carry ${toolCallId}, got ${toolResultId ?? '(none)'}`
      )
    }
    return { toolCallId }
  },
})

export const expectsTokenUsage = pikkuScenarioStep<
  { totalTokens: number },
  { totalTokens: number }
>({
  name: 'expectsTokenUsage',
  description: 'expects the finished run to report token usage',
  func: async (_services, { totalTokens }) => {
    if (totalTokens <= 0) {
      throw new Error(`Expected non-zero token usage, got ${totalTokens}`)
    }
    return { totalTokens }
  },
})
