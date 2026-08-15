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
import { pikkuScenarioStep } from '#pikku/scenarios/pikku-scenario-types.gen.js'
import { describeValue } from './support.js'
import type { MockLlmCall } from './agent-transport.js'

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
  default: async (_services, { run, refused }) => {
    const wasRefused = run.status >= 400 || Boolean(run.error)
    if (wasRefused !== refused) {
      throw new Error(
        refused
          ? `Expected a refusal, got ${run.status} (error: ${describeValue(run.error)})`
          : `Expected success, got ${run.status} (error: ${describeValue(run.error)})`
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
  default: async (_services, { run, equals }) => {
    if (JSON.stringify(run.result) !== JSON.stringify(equals)) {
      throw new Error(
        `Expected run result ${describeValue(equals)}, got ${describeValue(run.result)}`
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
  default: async (_services, { calls, count }) => {
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
    allHaveSchemas?: boolean
  },
  { toolNames: string[] }
>({
  name: 'expectsOfferedTools',
  description: 'expects which tools a model call was offered',
  template: 'expects call {index} tools',
  default: async (
    _services,
    { calls, index, offered, notOffered, none, allHaveSchemas }
  ) => {
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
    if (allHaveSchemas) {
      if (toolNames.length === 0) {
        throw new Error(
          `Expected call ${index} to be offered at least one tool to check schemas against`
        )
      }
      for (const tool of toolNames) {
        if (!call.toolSchemas?.[tool]) {
          throw new Error(`Tool "${tool}" was offered with no input schema`)
        }
      }
    }
    return { toolNames }
  },
})

/**
 * The shape of one model call, other than its tools.
 *
 * One step rather than the five cucumber definitions it replaces, because each
 * of those did the same `callsFor(...)` lookup and then read a single field.
 */
export const expectsModelCall = pikkuScenarioStep<
  {
    calls: MockLlmCall[]
    index: number
    temperature?: number
    modelId?: string
    instructionsNonEmpty?: boolean
    instructionsInclude?: string
    messagesInclude?: string
    hasNonTextPart?: boolean
    attachmentMediaType?: string
    receivedToolResult?: boolean
  },
  { index: number }
>({
  name: 'expectsModelCall',
  description: 'expects what one model call carried',
  template: 'expects call {index}',
  default: async (
    _services,
    {
      calls,
      index,
      temperature,
      modelId,
      instructionsNonEmpty,
      instructionsInclude,
      messagesInclude,
      hasNonTextPart,
      attachmentMediaType,
      receivedToolResult,
    }
  ) => {
    const call = calls[index - 1]
    if (!call) {
      throw new Error(
        `There is no model call ${index} — the run made ${calls.length}`
      )
    }
    if (temperature !== undefined && call.temperature !== temperature) {
      throw new Error(
        `Expected call ${index} at temperature ${temperature}, got ${describeValue(call.temperature)}`
      )
    }
    if (modelId !== undefined && call.modelId !== modelId) {
      throw new Error(
        `Expected call ${index} to use model ${modelId}, got ${describeValue(call.modelId)}`
      )
    }
    if (instructionsNonEmpty && !call.instructions?.length) {
      throw new Error(`Call ${index} carried no instructions`)
    }
    if (
      instructionsInclude !== undefined &&
      !(call.instructions ?? '').includes(instructionsInclude)
    ) {
      throw new Error(
        `Expected call ${index} instructions to include "${instructionsInclude}", got ${describeValue(call.instructions)}`
      )
    }
    if (messagesInclude !== undefined) {
      const history = JSON.stringify(call.messages ?? [])
      if (!history.includes(messagesInclude)) {
        throw new Error(
          `Expected call ${index} to have replayed ${describeValue(messagesInclude)}, got ${history}`
        )
      }
    }
    if (hasNonTextPart || attachmentMediaType !== undefined) {
      const userMessages = (call.messages ?? []).filter(
        (message: any) => message.role === 'user'
      )
      if (hasNonTextPart) {
        const parts = userMessages.flatMap((message: any) =>
          Array.isArray(message.content) ? message.content : []
        )
        const nonText = parts.filter(
          (part: any) => part.type && part.type !== 'text'
        )
        if (nonText.length === 0) {
          throw new Error(
            `Expected call ${index} to carry a non-text content part, got ${describeValue(parts)}`
          )
        }
      }
      if (
        attachmentMediaType !== undefined &&
        !JSON.stringify(userMessages).includes(attachmentMediaType)
      ) {
        throw new Error(
          `Expected call ${index} to carry an attachment of ${attachmentMediaType}, got ${describeValue(userMessages)}`
        )
      }
    }
    if (receivedToolResult) {
      const roles = (call.messages ?? []).map((message: any) => message.role)
      if (!roles.includes('tool')) {
        throw new Error(
          `Expected call ${index} to have received a tool result, got roles ${roles.join(', ') || '(none)'}`
        )
      }
    }
    return { index }
  },
})

/**
 * Every model call is one agent step, so the indexes are the loop's own record
 * of how many times it went round.
 */
export const expectsStepIndexes = pikkuScenarioStep<
  { calls: MockLlmCall[]; indexes: number[] },
  { indexes: number[] }
>({
  name: 'expectsStepIndexes',
  description: 'expects the step index of each model call',
  default: async (_services, { calls, indexes }) => {
    const actual = calls.map((call) => call.stepIndex)
    if (JSON.stringify(actual) !== JSON.stringify(indexes)) {
      throw new Error(
        `Expected step indexes ${indexes.join(', ')}, got ${actual.join(', ') || '(no calls)'}`
      )
    }
    return { indexes: actual }
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
  default: async (_services, { calls, failed, contains, doesNotContain }) => {
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

/**
 * The outcome of an RPC call, plus the leak guard the ownership scenarios rely on.
 *
 * `doesNotEcho` is not decoration: a refusal that quoted the threadId back would
 * confirm the thread exists, turning the guard into an existence oracle. That is
 * why the ForbiddenError is shaped the way it is, so it is asserted here.
 */
export const expectsRpcOutcome = pikkuScenarioStep<
  {
    call: { status: number; serialized: string }
    refused: boolean
    doesNotEcho?: string
  },
  { status: number }
>({
  name: 'expectsRpcOutcome',
  description: 'expects an RPC call to be refused or to succeed',
  template: 'expects refused={refused}',
  default: async (_services, { call, refused, doesNotEcho }) => {
    const body = JSON.parse(call.serialized)
    const wasRefused =
      call.status >= 400 || Boolean(body?.message ?? body?.errorId)
    if (wasRefused !== refused) {
      throw new Error(
        refused
          ? `Expected a refusal, got ${call.status} ${call.serialized}`
          : `Expected success, got ${call.status} ${call.serialized}`
      )
    }
    if (doesNotEcho !== undefined && call.serialized.includes(doesNotEcho)) {
      throw new Error(
        `The response echoed "${doesNotEcho}" back, which confirms the record exists: ${call.serialized}`
      )
    }
    return { status: call.status }
  },
})

/** What a listing RPC returned, by id. */
export const expectsListedIds = pikkuScenarioStep<
  { call: { serialized: string }; includes?: string; excludes?: string },
  { ids: string[] }
>({
  name: 'expectsListedIds',
  description: 'expects which records a listing returned',
  default: async (_services, { call, includes, excludes }) => {
    const body = JSON.parse(call.serialized)
    const ids: string[] = (Array.isArray(body) ? body : []).map(
      (record: any) => record?.id
    )
    if (includes !== undefined && !ids.includes(includes)) {
      throw new Error(
        `Expected the listing to include ${includes}, got ${ids.join(', ') || '(nothing)'}`
      )
    }
    if (excludes !== undefined && ids.includes(excludes)) {
      throw new Error(
        `The listing leaked ${excludes} to a caller who does not own it`
      )
    }
    return { ids }
  },
})

/**
 * Whether the run is waiting on human decisions, and what it is asking for.
 *
 * It reads the same three fields off a freshly suspended run and off a resumed
 * one, so the suspend and the resume are asserted by one step rather than two —
 * `runStatus` is the only thing that differs between them.
 */
export const expectsApprovalState = pikkuScenarioStep<
  {
    run: {
      status: number
      runStatus?: string
      pendingApprovals: { toolName: string; reason: string }[]
    }
    suspended: boolean
    count?: number
    reasonContains?: string
    /**
     * The whole reason, character for character. Worth asserting rather than
     * `reasonContains` when the wording is what is being consented to — a voice
     * client reads this string out and the user answers it, so a stray prefix
     * is a different question than the one the function sanctioned.
     */
    reasonEquals?: string
  },
  { pending: number }
>({
  name: 'expectsApprovalState',
  description: 'expects the run to be suspended for approval, or resumed',
  template: 'expects suspended={suspended}',
  default: async (
    _services,
    { run, suspended, count, reasonContains, reasonEquals }
  ) => {
    const isSuspended = run.runStatus === 'suspended'
    if (isSuspended !== suspended) {
      throw new Error(
        suspended
          ? `Expected the run to be suspended, its status is ${describeValue(run.runStatus)}`
          : `Expected the run to have resumed, it is still ${describeValue(run.runStatus)}`
      )
    }
    if (!suspended && run.status !== 200) {
      throw new Error(`Expected a resumed run to answer 200, got ${run.status}`)
    }
    if (count !== undefined && run.pendingApprovals.length !== count) {
      throw new Error(
        `Expected ${count} pending approval(s), got ${run.pendingApprovals.length}`
      )
    }
    if (reasonContains !== undefined) {
      const reasons = run.pendingApprovals.map((approval) => approval.reason)
      if (!reasons.some((reason) => reason.includes(reasonContains))) {
        throw new Error(
          `No pending approval reason contains ${describeValue(reasonContains)}, got ${describeValue(reasons)}`
        )
      }
    }
    if (reasonEquals !== undefined) {
      const reasons = run.pendingApprovals.map((approval) => approval.reason)
      if (!reasons.some((reason) => reason === reasonEquals)) {
        throw new Error(
          `No pending approval reason is exactly ${describeValue(reasonEquals)}, got ${describeValue(reasons)}`
        )
      }
    }
    return { pending: run.pendingApprovals.length }
  },
})

/**
 * What the thread persisted, read back through `getAgentThreadMessages` or
 * `getAgentThreadRuns`.
 *
 * `toolExecutions` counts tool-result records rather than store rows on purpose:
 * the todo addon keys by a millisecond timestamp, so three adds in one turn
 * collapse to one row. The framework-level observable is that every approved
 * call actually ran, which is one tool result per call.
 */
export const expectsThreadRecords = pikkuScenarioStep<
  {
    call: { serialized: string }
    contains?: string
    hasRole?: string
    count?: number
    toolExecutions?: { name: string; count: number }
  },
  { records: number }
>({
  name: 'expectsThreadRecords',
  description: 'expects what the thread persisted',
  default: async (
    _services,
    { call, contains, hasRole, count, toolExecutions }
  ) => {
    const body = JSON.parse(call.serialized)
    const records: any[] = Array.isArray(body) ? body : []

    if (contains !== undefined && !call.serialized.includes(contains)) {
      throw new Error(
        `Expected the thread to have recorded ${describeValue(contains)}, got ${call.serialized}`
      )
    }
    if (hasRole !== undefined) {
      const roles = records.map((record) => record?.role)
      if (!roles.includes(hasRole)) {
        throw new Error(
          `Expected a "${hasRole}" record, got roles ${roles.join(', ') || '(none)'}`
        )
      }
    }
    if (count !== undefined && records.length !== count) {
      throw new Error(`Expected ${count} record(s), got ${records.length}`)
    }
    if (toolExecutions !== undefined) {
      const executed = records
        .filter((record) => record?.role === 'tool')
        .flatMap((record) => record?.toolResults ?? [])
        .filter((result: any) => result?.name === toolExecutions.name)
      if (executed.length !== toolExecutions.count) {
        throw new Error(
          `Expected ${toolExecutions.count} execution(s) of ${toolExecutions.name}, got ${executed.length}`
        )
      }
    }
    return { records: records.length }
  },
})

/** What the shared todo store holds, read back through `todos:listTodos`. */
export const expectsTodos = pikkuScenarioStep<
  { call: { body: unknown }; includes?: string; excludes?: string },
  { titles: string[] }
>({
  name: 'expectsTodos',
  description: 'expects which todos the store holds',
  default: async (_services, { call, includes, excludes }) => {
    const todos = (call.body as { todos?: { title: string }[] })?.todos ?? []
    const titles = todos.map((todo) => todo.title)
    const holds = (needle: string) =>
      titles.some((title) => title.toLowerCase().includes(needle.toLowerCase()))

    if (includes !== undefined && !holds(includes)) {
      throw new Error(
        `Expected a todo matching ${describeValue(includes)}, got ${describeValue(titles)}`
      )
    }
    if (excludes !== undefined && holds(excludes)) {
      throw new Error(
        `Expected no todo matching ${describeValue(excludes)}, got ${describeValue(titles)}`
      )
    }
    return { titles }
  },
})

/**
 * That some call in the log was made by a given model with a given message.
 *
 * Matched rather than indexed, because a sub-agent's call is interleaved with
 * the parent's and its position depends on how many steps the parent took.
 */
export const expectsModelCallMatching = pikkuScenarioStep<
  { calls: MockLlmCall[]; modelId: string; userMessage: string },
  { modelId: string }
>({
  name: 'expectsModelCallMatching',
  description: 'expects a model call by model and message',
  template: 'expects {modelId} called with {userMessage}',
  default: async (_services, { calls, modelId, userMessage }) => {
    const match = calls.find(
      (call) => call.modelId === modelId && call.userMessage === userMessage
    )
    if (!match) {
      throw new Error(
        `No model call by ${modelId} with message ${describeValue(userMessage)}, saw ${describeValue(
          calls.map((call) => ({
            modelId: call.modelId,
            userMessage: call.userMessage,
          }))
        )}`
      )
    }
    return { modelId }
  },
})

/**
 * The whole call log for one run, searched as text.
 *
 * The two voice assertions are existence and absence across every call the run
 * made, not properties of a call at a known index — the transcript replaces the
 * user message, so there is no stable index to read. Scoped to this run's calls
 * rather than the process-global log, which is strictly narrower than the
 * cucumber step it replaces.
 */
export const expectsCallLog = pikkuScenarioStep<
  { calls: MockLlmCall[]; includes?: string; excludes?: string },
  { calls: number }
>({
  name: 'expectsCallLog',
  description: 'expects what the run’s model calls did and did not carry',
  default: async (_services, { calls, includes, excludes }) => {
    const serialized = JSON.stringify(calls)
    if (includes !== undefined && !serialized.includes(includes)) {
      throw new Error(
        `No model call carried ${describeValue(includes)} — the run made ${calls.length}`
      )
    }
    if (excludes !== undefined && serialized.includes(excludes)) {
      throw new Error(
        `A model call carried ${describeValue(excludes)}, which should never reach the model`
      )
    }
    return { calls: calls.length }
  },
})

/**
 * A structured run result, field by field.
 *
 * An agent with an `output` schema and no tools surfaces `result.object` rather
 * than the assistant text, so the assertion is that the result is an object at
 * all and then that the parsed fields carry their scripted values.
 */
export const expectsResultObject = pikkuScenarioStep<
  { run: { result: unknown }; fields: Record<string, unknown> },
  { fields: string[] }
>({
  name: 'expectsResultObject',
  description: 'expects a structured run result',
  default: async (_services, { run, fields }) => {
    if (run.result === null || typeof run.result !== 'object') {
      throw new Error(
        `Expected a structured object, got ${describeValue(run.result)}`
      )
    }
    const result = run.result as Record<string, unknown>
    for (const [field, expected] of Object.entries(fields)) {
      if (JSON.stringify(result[field]) !== JSON.stringify(expected)) {
        throw new Error(
          `Expected ${field} to be ${describeValue(expected)}, got ${describeValue(result[field])}`
        )
      }
    }
    return { fields: Object.keys(fields) }
  },
})
