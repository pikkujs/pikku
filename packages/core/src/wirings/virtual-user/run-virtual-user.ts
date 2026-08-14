import type { ResolvedPersona } from '../../services/personas-service.js'
import type { AgentMessage } from '../agent/agent.types.js'
import type { ActorLLM } from '../actor-flow/run-conversation.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  catalogueIndex,
  catalogueLookup,
  describeEntry,
  isReadOnly,
  reachableCatalogue,
  renderCatalogue,
} from './virtual-user-catalogue.js'
import {
  dispositionProfile,
  type DispositionProfile,
  type VirtualUserTuning,
} from './virtual-user-dispositions.js'
import { IntentStack, intentsForPersona } from './virtual-user-intents.js'
import { createRng } from './virtual-user-rng.js'
import type {
  ApiCatalogueEntry,
  IntentSource,
  StepRecord,
  VirtualUserAction,
  VirtualUserBudget,
  VirtualUserDisposition,
  VirtualUserFinding,
  VirtualUserRunResult,
  VirtualUserTally,
  VirtualUserTarget,
} from './virtual-user.types.js'

/** One turn: what the user decided to do next, and why. */
const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    thought: { type: 'string' },
    kind: {
      type: 'string',
      enum: ['describe', 'call', 'talkTo', 'upload', 'complete', 'stuck'],
    },
    rpcName: { type: 'string' },
    /**
     * A JSON object, as a string. Not `type: 'object'`: structured output is
     * strict, and a schema-less object is the one thing strict mode cannot
     * express — OpenAI rejects the whole request with "'additionalProperties'
     * is required to be supplied and to be false", so every turn 400s and the
     * run never takes a step. The arguments differ per endpoint and are only
     * known from the `describe` the user just did, so there is no schema to
     * give here; a string is how a free-form object crosses that boundary.
     */
    args: { type: 'string' },
    agent: { type: 'string' },
    task: { type: 'string' },
    file: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['kind'],
} as const

const DEFAULT_MAX_STEPS = 40
const DEFAULT_MAX_STEPS_PER_INTENT = 20
const RESPONSE_EXCERPT = 600

/** What an app-specific oracle is shown about one call. */
export interface VirtualUserCallContext {
  rpcName: string
  args: unknown
  status: number
  ok: boolean
  body: unknown
  intentId?: string
  step: number
  disposition: VirtualUserDisposition
}

export interface RunVirtualUserParams {
  /** The person being run — name, job title, personality, goals. */
  persona: ResolvedPersona
  /** The id they were declared under, as the intent sources refer to them. */
  personaId: string
  /** How it behaves. Default `realistic`. */
  disposition?: VirtualUserDisposition
  /** Per-user overrides for that disposition's dials. */
  tuning?: VirtualUserTuning
  /** Every RPC the app exposes. Narrowed internally; nothing is hidden by default. */
  catalogue: readonly ApiCatalogueEntry[]
  /** Features and scenarios in the app's own words — never their step graphs. */
  intents: readonly IntentSource[]
  /** Extra goals in the user's own words, run alongside the derived intents. */
  goals?: readonly string[]
  /** The transport it acts through. */
  target: VirtualUserTarget
  /** The user's own LLM. */
  llm: ActorLLM
  model: string
  budget?: VirtualUserBudget
  /**
   * The app's own stopping rule, given the running tally. Pikku counts steps,
   * calls, mutations and tokens because only the engine sees them; what they
   * cost is the app's to decide, which is why no price appears in core.
   */
  stop?: (tally: VirtualUserTally) => boolean | Promise<boolean>
  /** Fixed seed, so a run replays into the same finding. */
  seed?: number
  /**
   * Check a response against the RPC's own output schema. Supplied by the CLI
   * from generated schemas; a mismatch means the contract and the implementation
   * disagree, which nothing else in a normal test suite looks for.
   */
  validateOutput?: (rpcName: string, body: unknown) => string | null
  /** App-specific oracle — ownership, invariants, anything core cannot know. */
  classify?: (
    context: VirtualUserCallContext
  ) => VirtualUserFinding[] | null | undefined
  /** Files this user may upload. */
  fixtures?: readonly string[]
  /** Agents it may talk to. */
  agents?: readonly { name: string; description?: string }[]
  /** Ids and slugs remembered from an earlier run, for a `stale` user. */
  memory?: Record<string, string>
  /**
   * The scopes this persona actually holds, resolved from its roles at sign-in.
   *
   * Used two ways: to narrow a large catalogue to what it is entitled to reach,
   * and as an oracle — a call whose scopes it does not hold that nonetheless
   * succeeds is authorization drift.
   */
  scopes?: readonly string[]
  /**
   * Offer the endpoints the app marked as needing a human's approval. Off by
   * default: those are the ones that spend money and move real traffic.
   */
  allowApprovalRequired?: boolean
  maxStepsPerIntent?: number
}

const msg = (role: AgentMessage['role'], content: string): AgentMessage => ({
  id: globalThis.crypto.randomUUID(),
  role,
  content,
  createdAt: new Date(),
})

/** Read a structured result, falling back to parsing JSON out of the text. */
const readObject = <T>(result: {
  object?: unknown
  text?: string
}): T | null => {
  if (result.object && typeof result.object === 'object')
    return result.object as T
  if (result.text) {
    try {
      return JSON.parse(result.text) as T
    } catch {
      return null
    }
  }
  return null
}

/**
 * The arguments for a call, however the model chose to spell them.
 *
 * `ACTION_SCHEMA` asks for a JSON string because strict structured output
 * cannot carry a schema-less object, but a model reading the endpoint's own
 * schema will sometimes send the object anyway, and a scripted or non-strict
 * provider always will. Both are the same intent, so both are accepted; text
 * that is not JSON at all is not arguments, and calling with it would only
 * produce a 400 attributable to the wrong thing.
 */
const readArgs = (args: unknown): Record<string, unknown> => {
  if (args && typeof args === 'object') return args as Record<string, unknown>
  if (typeof args === 'string' && args.trim()) {
    try {
      const parsed = JSON.parse(args)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Not JSON — fall through to no arguments.
    }
  }
  return {}
}

/** Keys worth remembering across intents — the things a person writes down. */
const MEMORABLE = /(id|slug|token|email|name|key|url|code)$/i

/**
 * Pull identifiers out of a response so later intents can refer to them.
 *
 * This is what makes a run cohesive without ever handing the user a dataflow
 * map: it discovers that a project has an id by looking at one, the same way a
 * person reads it off the screen.
 */
export const rememberIds = (
  body: unknown,
  into: Record<string, string>,
  depth = 0
): Record<string, string> => {
  if (depth > 4 || body === null || typeof body !== 'object') return into
  if (Array.isArray(body)) {
    for (const item of body.slice(0, 5)) rememberIds(item, into, depth + 1)
    return into
  }
  for (const [key, value] of Object.entries(body)) {
    if (
      typeof value === 'string' &&
      MEMORABLE.test(key) &&
      value.length < 200
    ) {
      into[key] = value
    } else if (typeof value === 'object') {
      rememberIds(value, into, depth + 1)
    }
  }
  return into
}

const personaInstructions = (
  persona: ResolvedPersona,
  profile: DispositionProfile,
  catalogue: string,
  agents: readonly { name: string; description?: string }[],
  fixtures: readonly string[]
): string =>
  [
    `You are a real person using a product through its API. Stay in character; you are the user, not the system.`,
    `Your name is ${persona.name}.`,
    persona.jobTitle ? `Your role: ${persona.jobTitle}.` : '',
    persona.personality ? `Your manner: ${persona.personality}.` : '',
    '',
    profile.instructions,
    '',
    `Each turn you take exactly ONE action:`,
    `- describe: read an endpoint's schema. You MUST describe an endpoint before you may call it.`,
    `- call: invoke an endpoint with arguments that fit its schema. Put them in 'args' as a JSON object written as a string, e.g. "{\\"id\\":\\"abc\\"}".`,
    agents.length
      ? `- talkTo: ask one of the product's assistants to do something for you in plain language.`
      : '',
    fixtures.length ? `- upload: send one of your files.` : '',
    `- complete: you got what you came for.`,
    `- stuck: you cannot get there, and you can say why.`,
    '',
    agents.length
      ? `Assistants you can talk to:\n${agents
          .map(
            (agent) =>
              `- ${agent.name}${agent.description ? `: ${agent.description}` : ''}`
          )
          .join('\n')}`
      : '',
    fixtures.length ? `Files you have: ${fixtures.join(', ')}` : '',
    '',
    `The endpoints available to you, as name(inputs) -> outputs:`,
    catalogue,
  ]
    .filter(Boolean)
    .join('\n')

/**
 * Run one virtual user against a live target until its budget runs out.
 *
 * The engine schedules which intent is live and the model decides what to do
 * within it — that split is what lets a run be replayed from its seed while the
 * work inside it stays genuinely open-ended.
 */
export const runVirtualUser = async (
  params: RunVirtualUserParams
): Promise<VirtualUserRunResult> => {
  const {
    persona,
    personaId,
    disposition = 'realistic',
    tuning,
    target,
    llm,
    model,
    budget,
    stop,
    validateOutput,
    classify,
    fixtures = [],
    agents = [],
    scopes,
    allowApprovalRequired = false,
    maxStepsPerIntent = DEFAULT_MAX_STEPS_PER_INTENT,
  } = params

  const profile = dispositionProfile(disposition, tuning)
  const seed = params.seed ?? Math.floor(Math.random() * 2 ** 31)
  const rng = createRng(seed)
  const startedAt = Date.now()

  // An adversarial user is offered the whole surface on purpose — probing what
  // it should not reach is the behaviour under test — while `scopes` stays live
  // below as the oracle that says a success there was a finding.
  const reachable = reachableCatalogue(params.catalogue, {
    readOnly: profile.readOnly,
    allowApprovalRequired,
    scopes: profile.invertedOracle ? undefined : scopes,
  })
  const index = catalogueIndex(reachable)

  const sources: IntentSource[] = [
    ...intentsForPersona(params.intents, personaId),
    ...(params.goals ?? []).map((goal, i) => ({
      id: `goal_${i + 1}`,
      title: goal,
    })),
  ]
  const stack = new IntentStack(sources, rng, profile)

  const memory: Record<string, string> = profile.emptyMemory
    ? {}
    : { ...(params.memory ?? {}) }
  const described = new Set<string>()
  const findings: VirtualUserFinding[] = []
  const steps: StepRecord[] = []
  const history = new Map<string, AgentMessage[]>()

  const tally: VirtualUserTally = {
    steps: 0,
    calls: 0,
    mutations: 0,
    tokensIn: 0,
    tokensOut: 0,
    model,
    elapsedMs: 0,
    findings: 0,
  }

  const maxSteps = budget?.steps ?? DEFAULT_MAX_STEPS
  const maxDurationMs =
    budget?.duration === undefined
      ? undefined
      : typeof budget.duration === 'number'
        ? budget.duration
        : getDurationInMilliseconds(budget.duration)

  const instructions = personaInstructions(
    persona,
    profile,
    renderCatalogue(reachable),
    agents,
    fixtures
  )

  const addFinding = (finding: VirtualUserFinding) => {
    findings.push(finding)
    tally.findings++
  }

  // Every other exit sets this and breaks; running the loop out means the step
  // budget is what ended it.
  let stoppedBy: VirtualUserRunResult['stoppedBy'] = 'budget-steps'

  for (let step = 0; step < maxSteps; step++) {
    tally.elapsedMs = Date.now() - startedAt
    if (maxDurationMs !== undefined && tally.elapsedMs >= maxDurationMs) {
      stoppedBy = 'budget-duration'
      break
    }
    if (
      budget?.mutations !== undefined &&
      tally.mutations >= budget.mutations
    ) {
      stoppedBy = 'budget-mutations'
      break
    }
    if (stop && (await stop({ ...tally }))) {
      stoppedBy = 'stop-hook'
      break
    }

    const tick = stack.next(step)
    if (!tick) {
      // Nothing left to schedule: either this user was given no intents at all,
      // or it saw every one of them through.
      stoppedBy = stack.records().length === 0 ? 'no-intents' : 'exhausted'
      break
    }

    // A user who cannot get anywhere gives up rather than looping forever.
    if (tick.intent.steps.length > maxStepsPerIntent) {
      stack.stuck('gave up after going in circles')
      continue
    }

    const intentId = tick.intent.id
    if (!history.has(intentId)) {
      const source = tick.intent.source
      history.set(intentId, [
        msg(
          'user',
          [
            `What you want to do right now: ${source.title}`,
            source.description ?? '',
            source.steps?.length
              ? `Roughly how it goes:\n${source.steps.map((s) => `- ${s}`).join('\n')}`
              : '',
            `Work it out through the API yourself — nobody has told you which endpoints do this.`,
          ]
            .filter(Boolean)
            .join('\n')
        ),
      ])
    }
    const messages = history.get(intentId)!
    if (tick.move === 'resume' || tick.move === 'suspend') {
      messages.push(
        msg(
          'user',
          `You were pulled away and have come back to this. Things may have changed since.`
        )
      )
    }
    // knowledge: decisions/internals/a-virtual-user-decides-whether-to-trust-memory-once-per-turn.md
    if (Object.keys(memory).length && !rng.chance(profile.reReadRate)) {
      messages.push(
        msg(
          'user',
          `Things you have noted down: ${Object.entries(memory)
            .slice(-25)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ')}`
        )
      )
    } else if (Object.keys(memory).length) {
      messages.push(
        msg('user', `You are not sure your notes are current. Look things up.`)
      )
    }

    const result = await llm({
      model,
      temperature: profile.temperature,
      instructions,
      messages,
      tools: [],
      maxSteps: 1,
      toolChoice: 'none',
      outputSchema: ACTION_SCHEMA as unknown as Record<string, unknown>,
    })

    tally.steps++
    tally.tokensIn += result.usage?.inputTokens ?? 0
    tally.tokensOut += result.usage?.outputTokens ?? 0

    const raw = readObject<Record<string, unknown>>(result)
    const record: StepRecord = {
      index: step,
      intentId,
      action: { kind: 'invalid', detail: 'no action produced' },
      tokensIn: result.usage?.inputTokens ?? 0,
      tokensOut: result.usage?.outputTokens ?? 0,
    }

    if (!raw || typeof raw.kind !== 'string') {
      steps.push(record)
      messages.push(
        msg('user', 'That was not a valid action. Choose one action.')
      )
      continue
    }

    const action = { ...raw, kind: raw.kind } as unknown as VirtualUserAction
    record.action = action
    messages.push(msg('assistant', JSON.stringify(raw)))

    /** Tell the user what happened, so the next turn is informed. */
    const reply = (text: string) => messages.push(msg('user', text))

    if (action.kind === 'complete') {
      stack.complete(action.summary)
      steps.push(record)
      continue
    }
    if (action.kind === 'stuck') {
      stack.stuck(action.reason)
      steps.push(record)
      continue
    }

    if (action.kind === 'describe') {
      const entry = catalogueLookup(index, action.rpcName)
      if (!entry) {
        reply(`There is no endpoint called '${action.rpcName}'.`)
        steps.push(record)
        continue
      }
      described.add(entry.name)
      // Saying the gate is now open matters: reading a schema is free and
      // calling is not, so a model left to infer it will happily spend a whole
      // budget describing one endpoint after another and never touch the app.
      reply(
        `${JSON.stringify(describeEntry(entry))}\nYou have read this one, so you may now call '${entry.name}'.`
      )
      steps.push(record)
      continue
    }

    if (action.kind === 'talkTo') {
      if (!target.talkTo) {
        reply('There is nobody to talk to here.')
        steps.push(record)
        continue
      }
      const verdict = await target.talkTo(action.agent, action.task)
      record.ok = verdict.passed
      record.response = verdict.reasoning.slice(0, RESPONSE_EXCERPT)
      reply(
        `You spoke to ${action.agent}. ${verdict.passed ? 'It sorted it out.' : 'It did not.'} ${verdict.reasoning}`
      )
      steps.push(record)
      continue
    }

    if (action.kind === 'upload') {
      if (!target.upload) {
        reply('You have nowhere to send a file.')
        steps.push(record)
        continue
      }
      const response = await target.upload(action.file)
      record.status = response.status
      record.ok = response.ok
      record.response = response.serialized.slice(0, RESPONSE_EXCERPT)
      if (response.status >= 500) {
        record.findingKinds = ['server-error']
        addFinding({
          kind: 'server-error',
          detail: `upload '${action.file}' returned ${response.status}`,
          status: response.status,
          intentId,
          step,
        })
      }
      reply(`Upload came back ${response.status}: ${record.response}`)
      steps.push(record)
      continue
    }

    // Everything below is a call.
    const entry = catalogueLookup(index, action.rpcName)
    if (!entry) {
      reply(`There is no endpoint called '${action.rpcName}'.`)
      steps.push(record)
      continue
    }
    if (!described.has(entry.name)) {
      // Enforced rather than merely asked for: guessing field names is
      // unproductive fuzz that turns every 400 into a typo. Handing back the
      // schema makes this self-correcting in one turn.
      reply(
        `You do not know this endpoint's fields yet. Its schema is: ${JSON.stringify(
          describeEntry(entry)
        )}`
      )
      described.add(entry.name)
      steps.push(record)
      continue
    }

    // knowledge: decisions/internals/the-virtual-user-catalogue-is-the-only-gate-on-what-may-be-called.md
    const mutating = !isReadOnly(entry)

    const args = readArgs((action as { args?: unknown }).args)
    const repeats =
      profile.repeatRate > 0 && rng.chance(profile.repeatRate) ? 2 : 1
    let lastResponseText = ''

    for (let attempt = 0; attempt < repeats; attempt++) {
      let response
      try {
        response = await target.call(entry.name, args)
      } catch (error) {
        record.findingKinds = [
          ...(record.findingKinds ?? []),
          'transport-error',
        ]
        addFinding({
          kind: 'transport-error',
          detail: `${entry.name} threw: ${(error as Error).message}`,
          rpcName: entry.name,
          intentId,
          step,
        })
        lastResponseText = `The request failed outright: ${(error as Error).message}`
        break
      }

      tally.calls++
      if (mutating) tally.mutations++
      record.status = response.status
      record.ok = response.ok
      record.response = response.serialized.slice(0, RESPONSE_EXCERPT)
      lastResponseText = `${response.status}: ${record.response}`

      const kinds: NonNullable<StepRecord['findingKinds']> = []
      if (response.status >= 500) {
        kinds.push('server-error')
        addFinding({
          kind: 'server-error',
          detail: `${entry.name} returned ${response.status}`,
          rpcName: entry.name,
          status: response.status,
          intentId,
          step,
        })
      }
      if (response.ok && validateOutput) {
        const problem = validateOutput(entry.name, response.body)
        if (problem) {
          kinds.push('schema-violation')
          addFinding({
            kind: 'schema-violation',
            detail: `${entry.name} answered outside its own output schema: ${problem}`,
            rpcName: entry.name,
            status: response.status,
            intentId,
            step,
          })
        }
      }
      // This persona does not hold the scopes this endpoint declares, and the
      // server served it anyway — the declaration and the enforcement disagree.
      if (
        response.ok &&
        scopes &&
        entry.scopes?.some((scope) => !scopes.includes(scope))
      ) {
        kinds.push('unexpected-success')
        addFinding({
          kind: 'unexpected-success',
          detail: `${entry.name} succeeded for '${personaId}', who does not hold ${entry.scopes
            .filter((scope) => !scopes.includes(scope))
            .join(', ')}`,
          rpcName: entry.name,
          status: response.status,
          intentId,
          step,
        })
      }
      for (const finding of classify?.({
        rpcName: entry.name,
        args,
        status: response.status,
        ok: response.ok,
        body: response.body,
        intentId,
        step,
        disposition,
      }) ?? []) {
        kinds.push(finding.kind)
        addFinding({ ...finding, step })
      }
      if (kinds.length) {
        record.findingKinds = [...(record.findingKinds ?? []), ...kinds]
      }

      if (response.ok) rememberIds(response.body, memory)
      if (attempt + 1 < repeats) {
        lastResponseText += ` (you were not sure it went through, so you sent it again)`
      }
    }

    reply(lastResponseText)
    steps.push(record)
  }

  tally.elapsedMs = Date.now() - startedAt

  return {
    seed,
    tally,
    findings,
    intents: stack.records(),
    steps,
    memory,
    stoppedBy,
  }
}
