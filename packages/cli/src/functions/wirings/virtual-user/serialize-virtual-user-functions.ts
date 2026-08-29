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
 * A virtual user is still NOT a workflow: it explores, so no two attempts take
 * the same steps and there is nothing to replay. What it does need is a
 * trigger. `runVirtualUser` writes the record and returns the id; the run
 * itself is dispatched onto `pikku-virtual-user-runs`, at one attempt, because
 * a queue is the only dispatch that survives a deployment which puts each
 * function in its own unit — there is no in-process promise to leave running
 * there, and an RPC to a function nothing triggers has nowhere to land. A
 * project with no queue service keeps the in-process dispatch, which is
 * correct for the single process it runs in.
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
  /**
   * A short-lived Fabric operator token, handed in by whoever starts the run.
   *
   * Handed in rather than held: a deployed stage that could ask for a token
   * would be holding a credential able to mint admin sessions for itself, for
   * as long as the box lives. This way it holds one receipt, for one run, and
   * the receipt expires on its own. It is never written to the run record.
   */
  operatorToken: z.string().min(1).optional(),
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
  /**
   * What \`definePersonas()\` says about this persona now, alongside what the
   * row is actually running.
   *
   * A schedule is turned on once and then outlives the declaration it was
   * written from: someone edits \`personas.ts\`, redeploys, and the row keeps
   * running last month's goals with nothing anywhere to say so. Both sides
   * cross the wire so that difference is readable rather than inferred.
   */
  declared: z.object({
    disposition: Disposition,
    goals: z.array(z.string()),
  }),
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
  /** Carried from the caller for the duration of the dispatch, never stored. */
  operatorToken: z.string().optional(),
})

export const ExecuteVirtualUserRunOutput = z.object({
  findings: z.number(),
})
`

  const functions = `/**
 * Auto-generated virtual user functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuFunc, pikkuSessionlessFunc, type Session } from '${leaf('function')}'
import { pikkuMiddleware } from '${leaf('middleware')}'
import { wireQueueWorker } from '${leaf('queue')}'
import { defineScope } from '${leaf('scopes')}'
import {
  executeVirtualUserRun as executeRun,
  logVirtualUserTick,
  requireVirtualUserRunStore,
  serializeVirtualUserRun,
  serializeVirtualUserSchedule,
  serializeVirtualUserSteps,
  startVirtualUserRun,
  tickVirtualUserSchedules as tick,
  virtualUserScheduleRunInput,
  writeVirtualUserSchedule,
} from '@pikku/core/virtual-user'
import { createPersonas, personaConfigs, personaEnvironments } from '${pathToPersonas}'
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

/**
 * The wirings, and only the wirings.
 *
 * Every body below is one call into \`@pikku/core/virtual-user\`, because none of
 * this work varies by application — what is generated is the part that does:
 * the scopes this project declares, the schemas its RPCs are checked against,
 * and the \`rpc.invoke\` calls typed off its own RPC map.
 */
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

export const runVirtualUser = pikkuFunc({
  tags: ['pikku'],
  title: 'Run a Virtual User',
  description:
    'Turns a declared persona loose on this application and records what it finds. Returns immediately with a run id; read the result back with getVirtualUserRun.',
  expose: true,
  scopes: ['virtualUser:run'],
  input: RunVirtualUserInput,
  output: RunVirtualUserOutput,
  func: async (
    { virtualUserRunStore, config, queueService },
    input,
    { session, rpc }
  ) => {
    const { runId, persona, disposition, goals, memory, seed } =
      await startVirtualUserRun({
        store: virtualUserRunStore,
        personas: personaConfigs,
        // Which of the configured environments this process is decides whether
        // a run is against production. \`config\` is only the fallback for a
        // project that configures none, and is cast because an application's
        // Config is its own interface and need not declare nodeEnv at all.
        environments: personaEnvironments,
        config: config as { nodeEnv?: string } | undefined,
        persona: input.persona,
        disposition: input.disposition,
        seed: input.seed,
        goals: input.goals,
        memory: input.memory,
        startedBy: session?.userId ?? null,
      })

    const job = {
      runId,
      persona,
      disposition,
      goals,
      memory,
      seed,
      budget: input.budget,
      // Rides the dispatch and nothing else. The run record is deliberately
      // not given it: a record outlives the run, and a credential in a row
      // somebody can read back is a credential leak.
      operatorToken: input.operatorToken,
    }

    if (queueService) {
      // One attempt. A run is an exploration, so a redelivery is a second
      // different outing writing into a record that already has an outcome.
      await queueService.add('pikku-virtual-user-runs', job, {
        attempts: 1,
        pikkuUserId: session?.userId,
      })
    } else {
      // Deliberately not awaited: a run takes minutes, and a held-open request
      // survives neither a rollout nor a proxy timeout. executeVirtualUserRun
      // writes both outcomes to the record itself, so the only thing left to
      // handle here is a rejection escaping the promise — without the catch it
      // becomes an unhandled rejection and takes the process with it.
      void rpc!.invoke('executeVirtualUserRun', job).catch(() => {})
    }

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
    const run = await requireVirtualUserRunStore(
      virtualUserRunStore,
      true
    ).get(runId)
    if (!run) {
      throw new Error(\`No virtual user run \${runId}\`)
    }
    return serializeVirtualUserRun(run)
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
    const runs = await requireVirtualUserRunStore(
      virtualUserRunStore,
      true
    ).list({ persona, limit, offset })
    return { runs: runs.map(serializeVirtualUserRun) }
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
    const steps = await requireVirtualUserRunStore(
      virtualUserRunStore,
      true
    ).steps(runId, { limit, offset })
    return { steps: serializeVirtualUserSteps(steps) }
  },
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
    const schedule = await writeVirtualUserSchedule({
      store: virtualUserScheduleStore,
      personas: personaConfigs,
      ...input,
    })
    return serializeVirtualUserSchedule(schedule, personaConfigs)
  },
})

export const listVirtualUserSchedules = pikkuFunc({
  tags: ['pikku'],
  title: 'List Virtual User Schedules',
  description:
    'Which personas are on a clock, how often they run, and when each is next due.',
  expose: true,
  scopes: ['virtualUser:read'],
  output: ListVirtualUserSchedulesOutput,
  func: async ({ virtualUserScheduleStore }) => {
    if (!virtualUserScheduleStore) {
      return { schedules: [] }
    }
    const schedules = await virtualUserScheduleStore.list()
    return {
      schedules: schedules.map((schedule) =>
        serializeVirtualUserSchedule(schedule, personaConfigs)
      ),
    }
  },
})

/**
 * The identity a scheduled tick runs as.
 *
 * \`pikku-platform\` is the platform's own principal, and it already exists for
 * exactly this: a reserved user row created with no credential account of any
 * kind, so no sign-in method can resolve it, and one the user directory already
 * filters out — so unlike a seeded service account it costs no phantom member
 * in any list, seat count or bill.
 *
 * Not parameterised, because it is not a decision an application makes: work
 * this scaffold starts on its own clock is the platform's work, and the scope
 * is the one \`runVirtualUser\` gates on.
 *
 * Attached to \`wireScheduler\`'s \`middleware\` rather than declared as tag
 * middleware over \`/rpc\`, which cannot set a session at all: \`runScheduledTask\`
 * builds its wire with a \`sessionService\`, so the session set here is the one
 * the function is frozen with.
 */
const PLATFORM_USER_ID = 'pikku-platform'

export const virtualUserPlatformSession = pikkuMiddleware(
  async (_services, { setSession }, next) => {
    await setSession?.({
      userId: PLATFORM_USER_ID,
      scopes: ['virtualUser:run'],
    } as Session)
    return next()
  }
)

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
 *   middleware: [virtualUserPlatformSession],
 *   func: tickVirtualUserSchedules,
 * })
 * \`\`\`
 *
 * The middleware is not decoration: the tick starts a run through
 * \`runVirtualUser\`, the same gated entry point a person calls, so without a
 * session carrying \`virtualUser:run\` every dispatch is refused. Going through
 * that front door rather than a shared helper is the point — the persona
 * checks, the production-disposition rule and the record all live in one place,
 * and a second copy of them would eventually disagree with the first.
 *
 * An hourly tick is plenty for intervals measured in hours: the tick decides
 * nothing except which rows are already due, so running it more often costs a
 * query and changes no cadence.
 */
export const tickVirtualUserSchedules = pikkuSessionlessFunc<void, void>({
  tags: ['pikku'],
  func: async (services, _data, { rpc }) => {
    const { virtualUserScheduleStore, virtualUserRunStore, logger } = services
    if (!virtualUserScheduleStore || !virtualUserRunStore) {
      return
    }
    logVirtualUserTick(
      logger,
      await tick({
        schedules: virtualUserScheduleStore,
        runs: virtualUserRunStore,
        dispatch: async (schedule) => {
          const { runId } = await rpc!.invoke(
            'runVirtualUser',
            virtualUserScheduleRunInput(schedule)
          )
          return runId
        },
      })
    )
  },
})

/**
 * The run itself. Not exposed: it is dispatched by \`runVirtualUser\` and has no
 * caller of its own — but it is wired to a queue below, which is what gives it
 * a unit of its own under a per-function deploy.
 */
export const executeVirtualUserRun = pikkuSessionlessFunc({
  tags: ['pikku'],
  input: ExecuteVirtualUserRunInput,
  output: ExecuteVirtualUserRunOutput,
  func: async (
    { virtualUserRunStore, metaService, agentRunner, variables, logger },
    input
  ) =>
    executeRun({
      runStore: virtualUserRunStore,
      metaService,
      agentRunner,
      variables,
      logger,
      personas: personaConfigs,
      createPersonas,
      ...input,
    }),
})

wireQueueWorker({
  name: 'pikku-virtual-user-runs',
  tags: ['pikku'],
  func: executeVirtualUserRun,
})
`

  return { schemas, functions }
}
