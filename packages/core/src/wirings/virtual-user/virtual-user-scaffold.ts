import type { Logger } from '../../services/logger.js'
import type { MetaService } from '../../services/meta-service.js'
import type { VariablesService } from '../../services/variables-service.js'
import type { AgentRunnerService } from '../../services/agent-runner-service.js'
import type { HttpPersonasConfig } from '../../services/http-personas.js'
import type {
  ResolvedPersona,
  ScenarioPersonas,
} from '../../services/personas-service.js'
import { prepareVirtualUserRun } from './prepare-virtual-user-run.js'
import { runVirtualUser as runVirtualUserEngine } from './run-virtual-user.js'
import { personaVirtualUserTarget } from './virtual-user-target.js'
import type { SchemaMap } from './virtual-user-derive.js'
import type { PersonaEnvironment } from '../persona/persona-environments.js'
import { PRODUCTION_DISPOSITION } from './virtual-user.types.js'
import type {
  StepRecord,
  VirtualUserDisposition,
} from './virtual-user.types.js'
import type {
  VirtualUserRunRecord,
  VirtualUserRunStore,
} from './virtual-user-run-store.js'
import type {
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from './virtual-user-schedule-store.js'
import type { VirtualUserTickResult } from './virtual-user-schedule.js'

/**
 * The bodies behind the scaffolded virtual-user RPCs.
 *
 * The scaffold emits the *wirings* — the `pikkuFunc` shells whose `input`,
 * `output` and `scopes` the CLI reads back by AST, and the `rpc.invoke` calls
 * typed off the app's own RPC map. None of the work inside them varies by
 * application, so it lives here instead of inside a template string: type
 * checked when core builds, unit tested next to the engine it drives, and fixed
 * once rather than in every generated copy of it.
 *
 * What an application does supply arrives as a parameter — its declared
 * personas, its `createPersonas`, its config — because those are the only
 * things codegen knows that this cannot.
 */

/** Persona id → the declaration, which is what `personaConfigs` is. */
export type ScaffoldPersonas = Record<string, ResolvedPersona>

/**
 * The variables a scaffolded run reads.
 *
 * Names rather than values, and read through `VariablesService` at run time, so
 * a stage says where it lives without anything being baked into generated code.
 */
export const VIRTUAL_USER_VARIABLES = {
  /**
   * Where the virtual user signs in. Its own variable rather than a guess at
   * the host's origin: a run drives real traffic through the real front door,
   * and a server that cannot name its own public URL would be signing in
   * somewhere it only assumed was itself.
   */
  apiUrl: 'VIRTUAL_USER_API_URL',
  secret: 'SCENARIO_ACTOR_SECRET',
  model: 'VIRTUAL_USER_MODEL',
  /**
   * The same two variables a scenario run reads, because a virtual user signs
   * in and calls through exactly the doors a scenario does. An app that mounts
   * auth somewhere other than the root — `/api/auth` is the common one — has no
   * other way to say so, and without them the run signs in against a 404 and
   * spends its whole budget thinking about why nothing works.
   */
  signInPath: 'SCENARIO_SIGN_IN_PATH',
  rpcPath: 'SCENARIO_RPC_PATH',
  /**
   * The deployed way in. A Fabric operator token is asymmetric — a stage can
   * verify one and can never mint one — so unlike the actor secret it is safe
   * for a run against a real environment. Read from the environment only as the
   * fallback for a run nobody handed a token to, which is what a schedule is.
   */
  operatorToken: 'FABRIC_OPERATOR_TOKEN',
  createMissing: 'PIKKU_PERSONA_CREATE_MISSING',
} as const

/**
 * Which door under the auth mount, given the credential in hand.
 *
 * Both are better-auth plugins mounted side by side, so `SCENARIO_SIGN_IN_PATH`
 * names the mount and the last segment is ours to pick — an app that moved auth
 * to `/api/auth` says so once and both paths follow. A path that names neither
 * plugin is left alone, since it was configured deliberately.
 */
export const signInPathFor = (
  configured: string | undefined,
  plugin: 'actor' | 'fabric'
): string | undefined => {
  if (!configured) {
    return undefined
  }
  const mount = configured.replace(/\/sign-in\/(actor|fabric)$/, '')
  return mount === configured ? configured : `${mount}/sign-in/${plugin}`
}

/**
 * The declared persona behind an id, refused unless it is one a run may be.
 *
 * An acted-upon persona has no session of its own, and running one would race
 * whatever scenario acts on it.
 */
export const runnablePersona = (
  personas: ScaffoldPersonas,
  personaId: string
): ResolvedPersona => {
  const persona = personas[personaId]
  if (!persona) {
    throw new Error(
      `Unknown persona "${personaId}" — declare it with definePersonas()`
    )
  }
  if (!persona.runnable) {
    throw new Error(
      `Persona "${personaId}" is declared as acted upon, never run`
    )
  }
  return persona
}

const MISSING_RUN_STORE =
  'No virtualUserRunStore is wired — a run has nowhere to be recorded. ' +
  'Wire KyselyVirtualUserRunStore from @pikku/kysely, or your own implementation of VirtualUserRunStore.'

const MISSING_RUN_STORE_READ =
  'No virtualUserRunStore is wired — there are no runs to read.'

const MISSING_SCHEDULE_STORE =
  'No virtualUserScheduleStore is wired — a cadence has nowhere to live. ' +
  'Wire KyselyVirtualUserScheduleStore from @pikku/kysely, or your own implementation of VirtualUserScheduleStore.'

/** The store, or the error naming the one to wire. */
export const requireVirtualUserRunStore = (
  store: VirtualUserRunStore | undefined,
  reading = false
): VirtualUserRunStore => {
  if (!store) {
    throw new Error(reading ? MISSING_RUN_STORE_READ : MISSING_RUN_STORE)
  }
  return store
}

export const requireVirtualUserScheduleStore = (
  store: VirtualUserScheduleStore | undefined
): VirtualUserScheduleStore => {
  if (!store) {
    throw new Error(MISSING_SCHEDULE_STORE)
  }
  return store
}

/** What a caller asked for, before the declaration fills in what it left out. */
export interface StartVirtualUserRunParams {
  store: VirtualUserRunStore | undefined
  personas: ScaffoldPersonas
  /**
   * The app's config, read only for `nodeEnv` — structural because an
   * application's Config is its own interface and need not declare it at all.
   * The fallback signal, used only by a project that configures no environments.
   */
  config: { nodeEnv?: string } | undefined
  /** `environments` from pikku.config.json, as generated beside the personas. */
  environments?: Readonly<Record<string, PersonaEnvironment>>
  /** Which of them this process is. Defaults to `PIKKU_ENV`. */
  environment?: string
  persona: string
  disposition?: string
  seed?: number
  goals?: string[]
  memory?: Record<string, string>
  /** Whoever the session says, which for a scheduled tick is the platform user. */
  startedBy?: string | null
}

/** The recorded run, and the values the dispatch has to carry unchanged. */
export interface StartedVirtualUserRun {
  runId: string
  persona: string
  disposition: VirtualUserDisposition
  seed: number
  goals: string[]
  memory: Record<string, string>
}

/**
 * Whether this process is running against production, for the disposition rule.
 *
 * The configured environment wins over `NODE_ENV` because they answer different
 * questions. A deployment whose staging is a production *mirror* runs
 * `NODE_ENV=production` there too — keying on it refuses every disposition on
 * the one environment they exist to be used on. `PIKKU_ENV` names which of the
 * configured environments this is, which is the question actually being asked,
 * and it is the same signal `personaEnvironmentRefusal` already checks at
 * sign-in.
 *
 * Unresolved is treated as production: an environment nobody can name is one
 * whose data nobody can vouch for. `NODE_ENV` remains the answer only for a
 * project that configures no environments at all, which has no production
 * environment declared for this to be wrong about.
 */
const isProductionRun = (
  config: { nodeEnv?: string } | undefined,
  environments: Readonly<Record<string, PersonaEnvironment>> | undefined,
  environment: string | undefined
): boolean => {
  if (!environments || Object.keys(environments).length === 0) {
    return config?.nodeEnv === 'production'
  }
  return environment ? Boolean(environments[environment]?.production) : true
}

/**
 * Resolves a request against the declaration and records the run.
 *
 * Everything up to the point a run exists, which is everything a caller and a
 * scheduled tick have in common. The dispatch that follows is typed off the
 * app's RPC map, so it stays in the generated wiring.
 */
export const startVirtualUserRun = async ({
  store,
  personas,
  config,
  environments,
  environment = process.env.PIKKU_ENV,
  persona: personaId,
  disposition: requested,
  seed: requestedSeed,
  goals,
  memory,
  startedBy,
}: StartVirtualUserRunParams): Promise<StartedVirtualUserRun> => {
  const runStore = requireVirtualUserRunStore(store)
  const persona = runnablePersona(personas, personaId)

  const disposition = (requested ??
    persona.disposition ??
    'realistic') as VirtualUserDisposition

  // Every disposition other than this one exists to find out what the product
  // does wrong, which is not a thing to do to real customers' data. Checked
  // against the effective disposition, so an override cannot smuggle one in.
  if (
    disposition !== PRODUCTION_DISPOSITION &&
    isProductionRun(config, environments, environment)
  ) {
    throw new Error(
      `Only the '${PRODUCTION_DISPOSITION}' disposition may run against production; "${personaId}" is ${disposition}`
    )
  }

  // Seeded here rather than inside the engine so the record carries the seed
  // even if the run dies before returning — an unreproducible crash costs the
  // most.
  const seed = requestedSeed ?? Math.floor(Math.random() * 2_147_483_647)
  const resolvedGoals = goals ?? []
  const resolvedMemory = memory ?? {}

  const runId = await runStore.start({
    persona: persona.id,
    disposition,
    seed,
    goals: resolvedGoals,
    memory: resolvedMemory,
    startedBy: startedBy ?? null,
  })

  return {
    runId,
    persona: persona.id,
    disposition,
    seed,
    goals: resolvedGoals,
    memory: resolvedMemory,
  }
}

/**
 * One run on the wire.
 *
 * Findings and intents are free-form by design — the engine records what it
 * noticed, not a fixed row shape — so they cross as the schema's open objects
 * rather than being narrowed to whatever kinds exist today.
 */
export const serializeVirtualUserRun = (run: VirtualUserRunRecord) => ({
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

/** One run's turns on the wire. */
export const serializeVirtualUserSteps = (steps: readonly StepRecord[]) =>
  steps.map((step) => ({
    index: step.index,
    intentId: step.intentId,
    action: step.action as unknown as Record<string, unknown>,
    status: step.status,
    ok: step.ok,
    response: step.response,
    findingKinds: step.findingKinds as string[] | undefined,
    tokensIn: step.tokensIn,
    tokensOut: step.tokensOut,
  }))

/**
 * One schedule on the wire.
 *
 * The budget crosses as `durationMs` because that is what every other call here
 * takes; the engine's own duration also accepts `'30m'`, which nothing on this
 * side ever writes.
 */
export const serializeVirtualUserSchedule = (
  schedule: VirtualUserScheduleRecord,
  personas: ScaffoldPersonas
) => {
  const persona = personas[schedule.persona]
  return {
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
    declared: {
      disposition: (persona?.disposition ??
        'realistic') as VirtualUserDisposition,
      goals: persona?.goals ?? [],
    },
  }
}

export interface WriteVirtualUserScheduleParams {
  store: VirtualUserScheduleStore | undefined
  personas: ScaffoldPersonas
  persona: string
  enabled?: boolean
  disposition?: string
  goals?: string[]
  budget?: {
    steps?: number
    mutations?: number
    durationMs?: number
  } | null
  minIntervalMs?: number
  maxIntervalMs?: number
  nextRunAt?: string
}

/**
 * Writes a persona's cadence.
 *
 * Applies the same rule `startVirtualUserRun` enforces, at the point the row is
 * written rather than every hour afterwards: an acted-upon persona has no
 * session, so a cadence for one is a tick that can only ever fail to start.
 */
export const writeVirtualUserSchedule = async ({
  store,
  personas,
  persona,
  enabled,
  disposition,
  goals,
  budget,
  minIntervalMs,
  maxIntervalMs,
  nextRunAt,
}: WriteVirtualUserScheduleParams): Promise<VirtualUserScheduleRecord> => {
  const scheduleStore = requireVirtualUserScheduleStore(store)
  runnablePersona(personas, persona)
  return scheduleStore.set({
    persona,
    enabled,
    disposition: disposition as VirtualUserDisposition | undefined,
    goals,
    budget:
      budget === undefined
        ? undefined
        : budget === null
          ? null
          : {
              steps: budget.steps,
              mutations: budget.mutations,
              duration: budget.durationMs,
            },
    minIntervalMs,
    maxIntervalMs,
    nextRunAt: nextRunAt ? new Date(nextRunAt) : undefined,
  })
}

/** What a due schedule asks `runVirtualUser` for. */
export const virtualUserScheduleRunInput = (
  schedule: VirtualUserScheduleRecord
) => ({
  persona: schedule.persona,
  disposition: schedule.disposition as VirtualUserDisposition,
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
})

/**
 * What a tick did.
 *
 * Logged rather than returned: the caller is a cron, and a run this started is
 * otherwise the only trace that a persona is still out there working.
 */
export const logVirtualUserTick = (
  logger: Logger,
  result: VirtualUserTickResult
): void => {
  for (const { persona, runId } of result.dispatched) {
    logger.info(`Virtual user ${persona} started run ${runId} on schedule`)
  }
  for (const runId of result.reaped) {
    logger.warn(
      `Virtual user run ${runId} was abandoned — marked failed so its persona can run again`
    )
  }
  for (const { persona, reason } of result.skipped) {
    logger.info(`Virtual user ${persona} skipped this tick: ${reason}`)
  }
}

export interface ExecuteVirtualUserRunParams {
  runStore: VirtualUserRunStore | undefined
  metaService: MetaService | undefined
  agentRunner: AgentRunnerService | undefined
  variables: VariablesService
  logger: Logger
  personas: ScaffoldPersonas
  /** The app's generated `createPersonas`, which knows its own persona ids. */
  createPersonas: (
    options: Omit<HttpPersonasConfig, 'personas'>
  ) => ScenarioPersonas
  runId: string
  persona: string
  disposition: string
  goals: string[]
  memory: Record<string, string>
  seed: number
  budget?: {
    steps?: number
    mutations?: number
    durationMs?: number
  }
  operatorToken?: string
}

/**
 * The run itself.
 *
 * Everything it needs is derived through `metaService` and the generated
 * personas — the same public surface any consumer has. Nothing reaches into
 * pikku's internals, because an app could not, and a feature built on what only
 * the framework can see would not be this feature.
 */
export const executeVirtualUserRun = async ({
  runStore,
  metaService,
  agentRunner,
  variables,
  logger,
  personas,
  createPersonas,
  runId,
  persona: personaId,
  disposition,
  goals,
  memory,
  seed,
  budget,
  operatorToken,
}: ExecuteVirtualUserRunParams): Promise<{ findings: number }> => {
  const store = requireVirtualUserRunStore(runStore)
  try {
    if (!metaService) {
      throw new Error(
        'metaService is not wired — there is no catalogue to derive'
      )
    }
    if (!agentRunner) {
      throw new Error(
        'agentRunner is not wired — there is nothing to think with'
      )
    }

    const apiUrl = await variables.get(VIRTUAL_USER_VARIABLES.apiUrl)
    if (!apiUrl) {
      throw new Error(
        `${VIRTUAL_USER_VARIABLES.apiUrl} is not set — a virtual user has no address to sign in at.`
      )
    }

    // An operator token wins wherever one is available: it is asymmetric, and
    // it does not need the target to hold a shared secret at all. The actor
    // secret is the local-only fallback, because only `pikku dev` serves the
    // endpoint that accepts it.
    const token =
      operatorToken ??
      (await variables.get(VIRTUAL_USER_VARIABLES.operatorToken))
    const secret = token
      ? undefined
      : await variables.get(VIRTUAL_USER_VARIABLES.secret)
    if (!token && !secret) {
      throw new Error(
        `Neither an operator token nor ${VIRTUAL_USER_VARIABLES.secret} is available — there is nobody for the virtual user to be. ` +
          `Hand a Fabric operator token in with the run against a deployed stage, or export ${VIRTUAL_USER_VARIABLES.secret} against a local \`pikku dev\` target.`
      )
    }

    const createMissing =
      String(await variables.get(VIRTUAL_USER_VARIABLES.createMissing)) ===
      'true'
    const model = await variables.get(VIRTUAL_USER_VARIABLES.model)
    if (!model) {
      throw new Error(
        `${VIRTUAL_USER_VARIABLES.model} is not set — no model to think with.`
      )
    }

    const functionsMeta = await metaService.getFunctionsMeta()
    // Only the schemas the catalogue can actually refer to, so a large app does
    // not pull every schema it has ever generated into one run.
    const schemaNames = [
      ...new Set(
        Object.values(functionsMeta).flatMap((meta) =>
          [meta.inputSchemaName, meta.outputSchemaName].filter(
            (name: unknown): name is string => !!name
          )
        )
      ),
    ]
    const schemas = (await metaService.getSchemas(schemaNames)) as SchemaMap

    const persona = personas[personaId]
    if (!persona) {
      throw new Error(`Persona "${personaId}" is no longer declared`)
    }

    const { catalogue, intents, agents } = prepareVirtualUserRun({
      persona,
      functionsMeta,
      schemas,
      workflowsMeta: await metaService.getWorkflowMeta(),
      systemRoles: await metaService.getSystemRolesMeta(),
      agentsMeta: await metaService.getAgentsMeta(),
    })

    const configuredSignInPath =
      (await variables.get(VIRTUAL_USER_VARIABLES.signInPath)) ?? undefined
    const signedIn = createPersonas({
      apiUrl,
      ...(token
        ? {
            operator: {
              token,
              createMissing,
              signInPath: signInPathFor(configuredSignInPath, 'fabric'),
            },
          }
        : { secret }),
      model,
      signInPath: signInPathFor(configuredSignInPath, 'actor'),
      rpcPath:
        (await variables.get(VIRTUAL_USER_VARIABLES.rpcPath)) ?? undefined,
    })
    const target = signedIn[personaId]
    if (!target) {
      throw new Error(`Persona "${personaId}" cannot sign in`)
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
      // `AgentRunnerService.run` IS the engine's `ActorLLM` — same params, same
      // result — so a virtual user thinks through the same runner every agent in
      // the app does, provider quirks and all.
      llm: (params) => agentRunner.run(params),
      model,
      budget: {
        steps: budget?.steps,
        mutations: budget?.mutations,
        duration: budget?.durationMs,
      },
    })

    await store.complete(runId, {
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
    // 'running' forever is what `fail` exists to prevent.
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Virtual user run ${runId} (${personaId}) failed: ${message}`)
    await store.fail(runId, message)
    throw error
  }
}
