export interface VirtualUserGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the virtual-user functions into the project scaffold: start a run,
 * read one back, and the sessionless function that does the work.
 *
 * Scaffolded rather than shipped in an addon because the whole feature is
 * derived from what the project already generates — its personas, its function
 * meta, its scenarios — so there is nothing to configure and nothing to author.
 * `pikku persona run` does the same thing from a terminal; this is the same run
 * started over RPC, from CI or from a console, with the result kept.
 *
 * A virtual user is NOT a workflow and NOT a queued job. It explores, so no two
 * attempts take the same steps and there is nothing to replay; and the run
 * record already carries the progress a queue would only be holding on the way
 * here. So `runVirtualUser` writes the record, kicks the run off without
 * awaiting it, and returns the id. The one cost is stated on the record: a
 * restart mid-run strands it at `running`.
 *
 * Emitted as two files. The schemas are zod, and the inspector reads a zod
 * schema by importing the module that declares it — which it cannot do for the
 * functions file, whose relative pikku-types import per-unit deploy codegen
 * rewrites. Keeping the schemas in a sibling module that imports nothing but
 * zod sidesteps that entirely.
 */
export const serializeVirtualUserFunctions = (
  leaf: (name: string) => string,
  pathToPersonas: string
): VirtualUserGenOutput => {
  const schemas = `/**
 * Auto-generated virtual user schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

/** Every disposition \`DISPOSITIONS\` declares. */
export const Disposition = z.enum([
  'realistic',
  'careless',
  'newcomer',
  'stale',
  'auditor',
  'adversarial',
  'accountable',
])

/**
 * Where a run stops. Not a schedule: these cap one outing, and how often the
 * outings happen is \`setVirtualUserSchedule\`'s business.
 */
export const Budget = z.object({
  steps: z.number().int().min(1).max(500).optional(),
  mutations: z.number().int().min(0).max(500).optional(),
  durationMs: z.number().int().min(1000).max(3_600_000).optional(),
})

export const RunVirtualUserInput = z.object({
  /** A persona id from \`definePersonas()\`. */
  persona: z.string().min(1),
  /**
   * Situational goals in the caller's own words, run alongside the intents
   * derived from the app's scenarios. Appended to what the persona durably
   * wants, never a replacement — a run that replaces their goals is not them.
   */
  goals: z.array(z.string().min(1)).max(20).optional(),
  /**
   * Ids and slugs from an earlier run, replayed as this user's notes on turn
   * one. The point of a \`stale\` run: some of them no longer resolve, and what
   * the product does about that is the thing being tested.
   */
  memory: z.record(z.string(), z.string()).optional(),
  /** Overrides the persona's declared disposition for this run only. */
  disposition: Disposition.optional(),
  budget: Budget.optional(),
  /** Fixed seed, so a run replays into the same finding. */
  seed: z.number().int().optional(),
})

export const RunVirtualUserOutput = z.object({
  runId: z.string(),
})

export const GetVirtualUserRunInput = z.object({
  runId: z.string(),
})

/**
 * What the user noticed. \`kind\` is a plain string rather than an enum of
 * today's finding kinds: a run that turns up something new should be readable
 * by a client built before that kind existed.
 */
export const Finding = z.object({
  kind: z.string(),
  detail: z.string(),
  rpcName: z.string().optional(),
  status: z.number().optional(),
  intentId: z.string().optional(),
  /** Step index within the run, so the transcript can be replayed to here. */
  step: z.number(),
})

/**
 * What the user set out to do, and how far each one got. The spine a transcript
 * hangs off — the steps alone are a list of calls with no account of what they
 * were for.
 */
export const Intent = z.object({
  id: z.string(),
  sourceId: z.string(),
  title: z.string(),
  /** open | suspended | completed | abandoned | stuck, open-ended for the same
   * reason a finding's \`kind\` is. */
  status: z.string(),
  /** Step indices at which this intent was the active one. */
  steps: z.array(z.number()),
  /** How many times it was put down and picked back up. */
  suspensions: z.number(),
  summary: z.string().optional(),
})

/** One turn: what the engine scheduled, what the model did, what came back. */
export const Step = z.object({
  index: z.number(),
  intentId: z.string().optional(),
  /** The call it chose, or the \`invalid\` shape for a turn it got wrong. */
  action: z.record(z.string(), z.unknown()),
  status: z.number().optional(),
  ok: z.boolean().optional(),
  /** Truncated by the engine, so a transcript stays readable. */
  response: z.string().optional(),
  findingKinds: z.array(z.string()).optional(),
  tokensIn: z.number(),
  tokensOut: z.number(),
})

/**
 * Shared so a run reads the same whether it arrived one at a time or in a list.
 * Not exported: the schemas the inspector names are the ones a function wires.
 */
const virtualUserRunFields = {
  runId: z.string(),
  persona: z.string(),
  disposition: Disposition,
  seed: z.number(),
  status: z.enum(['running', 'completed', 'failed']),
  goals: z.array(z.string()),
  memory: z.record(z.string(), z.string()),
  findings: z.array(Finding),
  intents: z.array(Intent),
  /** Steps, calls, mutations, tokens and elapsed time, as the engine counted them. */
  tally: z.record(z.string(), z.unknown()).nullable(),
  stoppedBy: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
}

export const GetVirtualUserRunOutput = z.object(virtualUserRunFields)

export const ListVirtualUserRunsInput = z.object({
  /** Narrows to one persona's history. */
  persona: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

export const ListVirtualUserRunsOutput = z.object({
  /** Newest first. The transcript is not here — read it with getVirtualUserRunSteps. */
  runs: z.array(z.object(virtualUserRunFields)),
})

export const GetVirtualUserRunStepsInput = z.object({
  runId: z.string(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
})

export const GetVirtualUserRunStepsOutput = z.object({
  steps: z.array(Step),
})

/**
 * One persona's standing instruction to keep using the app.
 *
 * The interval is a range rather than a number: a user who arrives at exactly
 * 09:00 every day exercises one cache state and one cron neighbourhood, and a
 * real one does not keep an appointment.
 */
export const SetVirtualUserScheduleInput = z.object({
  persona: z.string().min(1),
  /** Off until something says otherwise — a schedule costs money on every tick. */
  enabled: z.boolean().optional(),
  disposition: Disposition.optional(),
  goals: z.array(z.string().min(1)).max(20).optional(),
  budget: Budget.nullable().optional(),
  minIntervalMs: z.number().int().min(60_000).optional(),
  maxIntervalMs: z.number().int().min(60_000).optional(),
  /** ISO. Omitted on a new schedule means the persona is due at once. */
  nextRunAt: z.string().optional(),
})

/** Not exported for the same reason the run fields are not. */
const virtualUserScheduleFields = {
  persona: z.string(),
  enabled: z.boolean(),
  disposition: Disposition,
  goals: z.array(z.string()),
  budget: Budget.nullable(),
  minIntervalMs: z.number(),
  maxIntervalMs: z.number(),
  nextRunAt: z.string(),
  lastRunId: z.string().nullable(),
  lastRunAt: z.string().nullable(),
}

export const SetVirtualUserScheduleOutput = z.object(virtualUserScheduleFields)

export const ListVirtualUserSchedulesOutput = z.object({
  schedules: z.array(z.object(virtualUserScheduleFields)),
})

/** The internal dispatch payload — everything the run was resolved down to. */
export const ExecuteVirtualUserRunInput = z.object({
  runId: z.string(),
  persona: z.string(),
  disposition: Disposition,
  goals: z.array(z.string()),
  memory: z.record(z.string(), z.string()),
  budget: z
    .object({
      steps: z.number().optional(),
      mutations: z.number().optional(),
      durationMs: z.number().optional(),
    })
    .optional(),
  seed: z.number(),
})

export const ExecuteVirtualUserRunOutput = z.object({
  findings: z.number(),
})
`

  const functions = `/**
 * Auto-generated virtual user functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuFunc, pikkuSessionlessFunc } from '${leaf('function')}'
import { defineScope } from '${leaf('scopes')}'
import { personaVirtualUserTarget, runVirtualUser as runVirtualUserEngine, type SchemaMap, type VirtualUserDisposition } from '@pikku/core/virtual-user'
import {
  prepareVirtualUserRun,
  PRODUCTION_DISPOSITION,
  tickVirtualUserSchedules as tick,
  type VirtualUserRunRecord,
  type VirtualUserRunStore,
  type VirtualUserScheduleRecord,
} from '@pikku/core/virtual-user'
import { createPersonas, personaConfigs } from '${pathToPersonas}'
import {
  ExecuteVirtualUserRunInput,
  ExecuteVirtualUserRunOutput,
  GetVirtualUserRunInput,
  GetVirtualUserRunOutput,
  GetVirtualUserRunStepsInput,
  GetVirtualUserRunStepsOutput,
  ListVirtualUserRunsInput,
  ListVirtualUserRunsOutput,
  ListVirtualUserSchedulesOutput,
  RunVirtualUserInput,
  RunVirtualUserOutput,
  SetVirtualUserScheduleInput,
  SetVirtualUserScheduleOutput,
} from './virtual-user.schemas.gen.js'

defineScope({
  virtualUser: {
    displayName: 'Virtual Users',
    description: 'Run personas against this application and read what they found',
    scopes: {
      run: { description: 'Start a virtual user run' },
      read: { description: "Read a run's findings" },
      schedule: {
        description: 'Decide that a persona keeps running on its own',
      },
    },
  },
})

/**
 * Where the virtual user signs in. Its own variable rather than a guess at the
 * host's origin: a run drives real traffic through the real front door, and a
 * server that cannot name its own public URL would be signing in somewhere it
 * only assumed was itself.
 */
const API_URL_VARIABLE = 'VIRTUAL_USER_API_URL'
const SECRET_VARIABLE = 'SCENARIO_ACTOR_SECRET'
const MODEL_VARIABLE = 'VIRTUAL_USER_MODEL'

/**
 * One run on the wire. Findings and intents are free-form by design — the
 * engine records what it noticed, not a fixed row shape — so they cross as the
 * schema's open objects rather than being narrowed to whatever kinds exist
 * today.
 */
const serializeRun = (run: VirtualUserRunRecord) => ({
  runId: run.runId,
  persona: run.persona,
  disposition: run.disposition,
  seed: run.seed,
  status: run.status,
  goals: run.goals,
  memory: run.memory,
  findings: run.findings.map((finding) => ({
    kind: finding.kind as string,
    detail: finding.detail,
    rpcName: finding.rpcName,
    status: finding.status,
    intentId: finding.intentId,
    step: finding.step,
  })),
  intents: run.intents.map((intent) => ({
    id: intent.id,
    sourceId: intent.sourceId,
    title: intent.title,
    status: intent.status as string,
    steps: intent.steps,
    suspensions: intent.suspensions,
    summary: intent.summary,
  })),
  tally: (run.tally ?? null) as Record<string, unknown> | null,
  stoppedBy: run.stoppedBy,
  error: run.error,
  createdAt: run.createdAt.toISOString(),
  finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
})

/**
 * Resolves a persona down to a run and kicks it off, for the two callers that
 * start one: a person with the scope, and the tick acting on a schedule.
 *
 * Shared rather than duplicated because the checks are the point — an acted-upon
 * persona has no session, and only one disposition may ever touch production.
 * A second copy of that would eventually disagree with this one.
 */
const startVirtualUserRun = async (
  services: {
    virtualUserRunStore?: VirtualUserRunStore
    config: { nodeEnv?: string }
  },
  rpc: { invoke: (name: string, data: any) => Promise<unknown> },
  input: {
    persona: string
    disposition?: string
    goals?: string[]
    memory?: Record<string, string>
    budget?: { steps?: number; mutations?: number; durationMs?: number }
    seed?: number
    startedBy?: string | null
  }
): Promise<string> => {
  const { virtualUserRunStore, config } = services
  if (!virtualUserRunStore) {
    throw new Error(
      'No virtualUserRunStore is wired — a run has nowhere to be recorded. ' +
        'Wire KyselyVirtualUserRunStore from @pikku/kysely, or your own implementation of VirtualUserRunStore.'
    )
  }

  const persona = personaConfigs[input.persona as keyof typeof personaConfigs] as
    | { id: string; runnable: boolean; disposition?: string }
    | undefined
  if (!persona) {
    throw new Error(
      \`Unknown persona "\${input.persona}" — declare it with definePersonas()\`
    )
  }
  // An acted-upon persona has no session of its own, and running one would
  // race whatever scenario acts on it.
  if (!persona.runnable) {
    throw new Error(
      \`Persona "\${input.persona}" is declared as acted upon, never run\`
    )
  }

  const disposition = (input.disposition ??
    persona.disposition ??
    'realistic') as VirtualUserDisposition
  // Every disposition other than this one exists to find out what the product
  // does wrong, which is not a thing to do to real customers' data. Checked
  // against the effective disposition, so the override cannot smuggle one in.
  if (
    config.nodeEnv === 'production' &&
    disposition !== PRODUCTION_DISPOSITION
  ) {
    throw new Error(
      \`Only the '\${PRODUCTION_DISPOSITION}' disposition may run against production; "\${input.persona}" is \${disposition}\`
    )
  }

  // Seeded here rather than inside the engine so the record carries the seed
  // even if the run dies before returning — an unreproducible crash costs the
  // most.
  const seed = input.seed ?? Math.floor(Math.random() * 2_147_483_647)

  const runId = await virtualUserRunStore.start({
    persona: persona.id,
    disposition,
    seed,
    goals: input.goals ?? [],
    memory: input.memory ?? {},
    startedBy: input.startedBy ?? null,
  })

  // Deliberately not awaited: a run takes minutes, and a held-open request
  // survives neither a rollout nor a proxy timeout. executeVirtualUserRun
  // writes both outcomes to the record itself, so the only thing left to
  // handle here is a rejection escaping the promise — without the catch it
  // becomes an unhandled rejection and takes the process with it.
  void rpc
    .invoke('executeVirtualUserRun', {
      runId,
      persona: persona.id,
      disposition,
      goals: input.goals ?? [],
      memory: input.memory ?? {},
      budget: input.budget,
      seed,
    })
    .catch(() => {})

  return runId
}

export const runVirtualUser = pikkuFunc({
  tags: ['pikku'],
  title: 'Run a Virtual User',
  description:
    'Turns a declared persona loose on this application and records what it finds. Returns immediately with a run id; read the result back with getVirtualUserRun.',
  expose: true,
  scopes: ['virtualUser:run'],
  input: RunVirtualUserInput,
  output: RunVirtualUserOutput,
  func: async ({ virtualUserRunStore, config }, input, { session, rpc }) => {
    const runId = await startVirtualUserRun(
      { virtualUserRunStore, config },
      rpc!,
      { ...input, startedBy: session?.userId ?? null }
    )
    return { runId }
  },
})

export const getVirtualUserRun = pikkuFunc({
  tags: ['pikku'],
  title: 'Read a Virtual User Run',
  description:
    'Reads a run back: its status, what it found, and the counts the engine kept.',
  expose: true,
  // Its own scope, and not the one that starts a run: an adversarial run's
  // findings are working exploits carrying live ids, so reading them is the
  // more sensitive of the two.
  scopes: ['virtualUser:read'],
  input: GetVirtualUserRunInput,
  output: GetVirtualUserRunOutput,
  func: async ({ virtualUserRunStore }, { runId }) => {
    if (!virtualUserRunStore) {
      throw new Error('No virtualUserRunStore is wired — there are no runs to read.')
    }
    const run = await virtualUserRunStore.get(runId)
    if (!run) {
      throw new Error(\`No virtual user run \${runId}\`)
    }
    return serializeRun(run)
  },
})

export const listVirtualUserRuns = pikkuFunc({
  tags: ['pikku'],
  title: 'List Virtual User Runs',
  description:
    "Reads back what the virtual users have been doing, newest first. Narrow with \`persona\` for one user's history.",
  expose: true,
  scopes: ['virtualUser:read'],
  input: ListVirtualUserRunsInput,
  output: ListVirtualUserRunsOutput,
  func: async ({ virtualUserRunStore }, { persona, limit, offset }) => {
    if (!virtualUserRunStore) {
      throw new Error('No virtualUserRunStore is wired — there are no runs to read.')
    }
    const runs = await virtualUserRunStore.list({ persona, limit, offset })
    return { runs: runs.map(serializeRun) }
  },
})

export const getVirtualUserRunSteps = pikkuFunc({
  tags: ['pikku'],
  title: 'Read a Virtual User Transcript',
  description:
    'Every turn one run took, in order: what it called, what came back, and what that cost.',
  expose: true,
  // The transcript is strictly more sensitive than the summary it belongs to —
  // it carries the live ids and payloads the run actually sent — so it sits
  // behind the same read scope rather than a looser one.
  scopes: ['virtualUser:read'],
  input: GetVirtualUserRunStepsInput,
  output: GetVirtualUserRunStepsOutput,
  func: async ({ virtualUserRunStore }, { runId, limit, offset }) => {
    if (!virtualUserRunStore) {
      throw new Error('No virtualUserRunStore is wired — there are no runs to read.')
    }
    const steps = await virtualUserRunStore.steps(runId, { limit, offset })
    return {
      steps: steps.map((step) => ({
        index: step.index,
        intentId: step.intentId,
        action: step.action as unknown as Record<string, unknown>,
        status: step.status,
        ok: step.ok,
        response: step.response,
        findingKinds: step.findingKinds as string[] | undefined,
        tokensIn: step.tokensIn,
        tokensOut: step.tokensOut,
      })),
    }
  },
})

/**
 * One schedule on the wire. The budget crosses as \`durationMs\` because that is
 * what every other call here takes; the engine's own duration also accepts
 * \`'30m'\`, which nothing on this side ever writes.
 */
const serializeSchedule = (schedule: VirtualUserScheduleRecord) => ({
  persona: schedule.persona,
  enabled: schedule.enabled,
  disposition: schedule.disposition,
  goals: schedule.goals,
  budget: schedule.budget
    ? {
        steps: schedule.budget.steps,
        mutations: schedule.budget.mutations,
        durationMs:
          typeof schedule.budget.duration === 'number'
            ? schedule.budget.duration
            : undefined,
      }
    : null,
  minIntervalMs: schedule.minIntervalMs,
  maxIntervalMs: schedule.maxIntervalMs,
  nextRunAt: schedule.nextRunAt.toISOString(),
  lastRunId: schedule.lastRunId,
  lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
})

export const setVirtualUserSchedule = pikkuFunc({
  tags: ['pikku'],
  title: 'Put a Virtual User on a Clock',
  description:
    'Says how often a persona should use the application on its own. Off until enabled, and every field left out keeps what it already had.',
  expose: true,
  // Its own scope, and the most powerful one here: starting a run spends money
  // once with a caller present to see it, while writing a schedule spends it
  // repeatedly with nobody there.
  scopes: ['virtualUser:schedule'],
  input: SetVirtualUserScheduleInput,
  output: SetVirtualUserScheduleOutput,
  func: async ({ virtualUserScheduleStore }, input) => {
    if (!virtualUserScheduleStore) {
      throw new Error(
        'No virtualUserScheduleStore is wired — a cadence has nowhere to live. ' +
          'Wire KyselyVirtualUserScheduleStore from @pikku/kysely, or your own implementation of VirtualUserScheduleStore.'
      )
    }
    if (!personaConfigs[input.persona as keyof typeof personaConfigs]) {
      throw new Error(
        \`Unknown persona "\${input.persona}" — declare it with definePersonas()\`
      )
    }
    const schedule = await virtualUserScheduleStore.set({
      persona: input.persona,
      enabled: input.enabled,
      disposition: input.disposition as VirtualUserDisposition | undefined,
      goals: input.goals,
      budget:
        input.budget === undefined
          ? undefined
          : input.budget === null
            ? null
            : {
                steps: input.budget.steps,
                mutations: input.budget.mutations,
                duration: input.budget.durationMs,
              },
      minIntervalMs: input.minIntervalMs,
      maxIntervalMs: input.maxIntervalMs,
      nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
    })
    return serializeSchedule(schedule)
  },
})

export const listVirtualUserSchedules = pikkuFunc({
  tags: ['pikku'],
  title: 'List Virtual User Schedules',
  description:
    'Which personas are on a clock, how often they run, and when each is next due.',
  expose: true,
  scopes: ['virtualUser:read'],
  input: null,
  output: ListVirtualUserSchedulesOutput,
  func: async ({ virtualUserScheduleStore }) => {
    if (!virtualUserScheduleStore) {
      return { schedules: [] }
    }
    const schedules = await virtualUserScheduleStore.list()
    return { schedules: schedules.map(serializeSchedule) }
  },
})

/**
 * Acts on whichever personas are due, once.
 *
 * Not exposed, and not wired to anything: pikku does not start a timer on an
 * application's behalf. A scaffolded scheduled task would begin spending model
 * budget the moment a project ran \`pikku all\`, which is not a thing a codegen
 * step gets to decide. Wire it when you mean it:
 *
 * \`\`\`ts
 * wireScheduler({
 *   name: 'virtualUsers',
 *   schedule: '0 * * * *',
 *   func: tickVirtualUserSchedules,
 * })
 * \`\`\`
 *
 * An hourly tick is plenty for intervals measured in hours: the tick
 * decides nothing except which rows are already due, so running it more often
 * costs a query and changes no cadence.
 */
export const tickVirtualUserSchedules = pikkuSessionlessFunc<void, void>({
  tags: ['pikku'],
  func: async (services, _data, { rpc }) => {
    const { virtualUserScheduleStore, virtualUserRunStore, logger } = services
    if (!virtualUserScheduleStore || !virtualUserRunStore) {
      return
    }
    const result = await tick({
      schedules: virtualUserScheduleStore,
      runs: virtualUserRunStore,
      dispatch: (schedule) =>
        startVirtualUserRun(services, rpc!, {
          persona: schedule.persona,
          disposition: schedule.disposition,
          goals: schedule.goals,
          budget: schedule.budget
            ? {
                steps: schedule.budget.steps,
                mutations: schedule.budget.mutations,
                durationMs:
                  typeof schedule.budget.duration === 'number'
                    ? schedule.budget.duration
                    : undefined,
              }
            : undefined,
        }),
    })
    // Logged rather than returned: the caller is a cron, and a run this started
    // is otherwise the only trace that a persona is still out there working.
    for (const { persona, runId } of result.dispatched) {
      logger.info(\`Virtual user \${persona} started run \${runId} on schedule\`)
    }
    for (const runId of result.reaped) {
      logger.warn(
        \`Virtual user run \${runId} was abandoned — marked failed so its persona can run again\`
      )
    }
    for (const { persona, reason } of result.skipped) {
      logger.info(\`Virtual user \${persona} skipped this tick: \${reason}\`)
    }
  },
})

/**
 * The run itself. Not exposed: it is dispatched by \`runVirtualUser\` and has no
 * caller of its own.
 *
 * Everything it needs is derived through \`metaService\` and the generated
 * personas — the same public surface any consumer has. Nothing reaches into
 * pikku's internals, because an app could not, and a feature built on what only
 * the framework can see would not be this feature.
 */
export const executeVirtualUserRun = pikkuSessionlessFunc({
  tags: ['pikku'],
  input: ExecuteVirtualUserRunInput,
  output: ExecuteVirtualUserRunOutput,
  func: async (
    { virtualUserRunStore, metaService, agentRunner, variables, logger },
    { runId, persona: personaId, disposition, goals, memory, budget, seed }
  ) => {
    if (!virtualUserRunStore) {
      throw new Error('No virtualUserRunStore is wired.')
    }
    try {
      if (!metaService) {
        throw new Error('metaService is not wired — there is no catalogue to derive')
      }
      if (!agentRunner) {
        throw new Error('agentRunner is not wired — there is nothing to think with')
      }

      const apiUrl = await variables.get(API_URL_VARIABLE)
      if (!apiUrl) {
        throw new Error(
          \`\${API_URL_VARIABLE} is not set — a virtual user has no address to sign in at.\`
        )
      }
      const secret = await variables.get(SECRET_VARIABLE)
      if (!secret) {
        throw new Error(
          \`\${SECRET_VARIABLE} is not set — actor sign-in is disabled, so there is nobody for the virtual user to be.\`
        )
      }
      const model = await variables.get(MODEL_VARIABLE)
      if (!model) {
        throw new Error(\`\${MODEL_VARIABLE} is not set — no model to think with.\`)
      }

      const functionsMeta = await metaService.getFunctionsMeta()
      // Only the schemas the catalogue can actually refer to, so a large app
      // does not pull every schema it has ever generated into one run.
      const schemaNames = [
        ...new Set(
          Object.values(functionsMeta).flatMap((meta: any) =>
            [meta.inputSchemaName, meta.outputSchemaName].filter(
              (name: unknown): name is string => !!name
            )
          )
        ),
      ]
      const schemas = (await metaService.getSchemas(schemaNames)) as SchemaMap

      const persona = personaConfigs[personaId as keyof typeof personaConfigs]
      if (!persona) {
        throw new Error(\`Persona "\${personaId}" is no longer declared\`)
      }

      const { catalogue, intents, agents } = prepareVirtualUserRun({
        persona,
        functionsMeta,
        schemas,
        workflowsMeta: await metaService.getWorkflowMeta(),
        systemRoles: await metaService.getSystemRolesMeta(),
        agentsMeta: await metaService.getAgentsMeta(),
      })

      const signedIn = createPersonas({ apiUrl, secret, model })
      const target = signedIn[personaId as keyof typeof signedIn]
      if (!target) {
        throw new Error(\`Persona "\${personaId}" cannot sign in\`)
      }

      const result = await runVirtualUserEngine({
        persona,
        personaId,
        disposition: disposition as VirtualUserDisposition,
        catalogue,
        intents,
        goals,
        memory,
        seed,
        agents,
        target: personaVirtualUserTarget(target, {
          model,
          agents: agents.map((agent) => agent.name),
        }),
        // \`AgentRunnerService.run\` IS the engine's \`ActorLLM\` — same params,
        // same result — so a virtual user thinks through the same runner every
        // agent in the app does, provider quirks and all.
        llm: (params) => agentRunner.run(params),
        model,
        budget: {
          steps: budget?.steps,
          mutations: budget?.mutations,
          duration: budget?.durationMs,
        },
      })

      await virtualUserRunStore.complete(runId, {
        findings: result.findings,
        tally: result.tally,
        memory: result.memory,
        stoppedBy: result.stoppedBy ?? null,
        intents: result.intents,
        steps: result.steps,
      })

      return { findings: result.findings.length }
    } catch (error) {
      // A crashed run and a run that found nothing are different states, and the
      // record is the only place that distinction survives — leaving it at
      // 'running' forever is what \`fail\` exists to prevent.
      const message = error instanceof Error ? error.message : String(error)
      logger.error(\`Virtual user run \${runId} (\${personaId}) failed: \${message}\`)
      await virtualUserRunStore.fail(runId, message)
      throw error
    }
  },
})
`

  return { schemas, functions }
}
