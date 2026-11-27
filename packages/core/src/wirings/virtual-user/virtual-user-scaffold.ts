import {
  inProcessSignIn,
  type InProcessAuth,
} from '../../services/virtual-user-sign-in.js'
import type { Logger } from '../../services/logger.js'
import type { MetaService } from '../../services/meta-service.js'
import type { VariablesService } from '../../services/variables-service.js'
import type { AgentRunnerService } from '../../services/agent-runner-service.js'
import type { HttpVirtualUsersConfig } from './http-virtual-users.js'
import type {
  ResolvedVirtualUser,
  ScenarioVirtualUsers,
} from '../../services/virtual-users-service.js'
import { readEnvVariable } from '../../env.js'
import { BadRequestError, ForbiddenError } from '../../errors/errors.js'
import { prepareVirtualUserRun } from './prepare-virtual-user-run.js'
import { runVirtualUser as runVirtualUserEngine } from './run-virtual-user.js'
import { virtualUserTarget } from './virtual-user-target.js'
import type { SchemaMap } from './virtual-user-derive.js'
import type { VirtualUserEnvironment } from '../virtual-user/virtual-user-environments.js'
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
 * virtual users, its `createVirtualUsers`, its config — because those are the only
 * things codegen knows that this cannot.
 */

/** Virtual user id → the declaration, which is what `virtualUserConfigs` is. */
export type ScaffoldVirtualUsers = Record<string, ResolvedVirtualUser>

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
  model: 'VIRTUAL_USER_MODEL',
  /**
   * Where the app serves its exposed RPCs, as a scenario run reads it. An app
   * that mounts them somewhere other than `/rpc` has no other way to say so.
   */
  rpcPath: 'SCENARIO_RPC_PATH',
} as const

/**
 * The declared virtual user behind an id, refused unless it is one a run may be.
 *
 * An acted-upon virtual user has no session of its own, and running one would race
 * whatever scenario acts on it.
 */
export const runnableVirtualUser = (
  virtualUsers: ScaffoldVirtualUsers,
  virtualUserId: string
): ResolvedVirtualUser => {
  const virtualUser = virtualUsers[virtualUserId]
  if (!virtualUser) {
    throw new BadRequestError(
      `Unknown virtual user "${virtualUserId}" — declare it with defineVirtualUsers()`
    )
  }
  if (!virtualUser.runnable) {
    throw new BadRequestError(
      `VirtualUser "${virtualUserId}" is declared as acted upon, never run`
    )
  }
  return virtualUser
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

/**
 * The schedule store, or an error naming the one to wire.
 *
 * @throws Error when no `virtualUserScheduleStore` is wired.
 */
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
  virtualUsers: ScaffoldVirtualUsers
  /**
   * The app's config, read only for `nodeEnv` — structural because an
   * application's Config is its own interface and need not declare it at all.
   * The fallback signal, used only by a project that configures no environments.
   */
  config: { nodeEnv?: string } | undefined
  /** `environments` from pikku.config.json, as generated beside the virtual users. */
  environments?: Readonly<Record<string, VirtualUserEnvironment>>
  /** Which of them this process is. Defaults to `PIKKU_ENV`. */
  environment?: string
  virtualUserId: string
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
  virtualUserId: string
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
 * and it is the same signal `virtualUserEnvironmentRefusal` already checks at
 * sign-in.
 *
 * Unresolved is treated as production: an environment nobody can name is one
 * whose data nobody can vouch for. `NODE_ENV` remains the answer only for a
 * project that configures no environments at all, which has no production
 * environment declared for this to be wrong about.
 */
const isProductionRun = (
  config: { nodeEnv?: string } | undefined,
  environments: Readonly<Record<string, VirtualUserEnvironment>> | undefined,
  environment: string | undefined
): boolean => {
  if (!environments || Object.keys(environments).length === 0) {
    return config?.nodeEnv === 'production'
  }
  return environment ? Boolean(environments[environment]?.production) : true
}

// A virtual user is a probe, and probing is not a thing to do to real
// customers' data, whatever the disposition.
const refuseInProduction = (
  virtualUserId: string,
  config: { nodeEnv?: string } | undefined,
  environments: Readonly<Record<string, VirtualUserEnvironment>> | undefined,
  environment: string | undefined
) => {
  if (isProductionRun(config, environments, environment)) {
    throw new ForbiddenError(
      `Virtual users do not run against production; "${virtualUserId}" cannot run here`
    )
  }
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
  virtualUsers,
  config,
  environments,
  environment = readEnvVariable('PIKKU_ENV'),
  virtualUserId,
  disposition: requested,
  seed: requestedSeed,
  goals,
  memory,
  startedBy,
}: StartVirtualUserRunParams): Promise<StartedVirtualUserRun> => {
  const runStore = requireVirtualUserRunStore(store)
  const virtualUser = runnableVirtualUser(virtualUsers, virtualUserId)

  const disposition = (requested ??
    virtualUser.disposition ??
    'realistic') as VirtualUserDisposition

  refuseInProduction(virtualUserId, config, environments, environment)

  // Seeded here rather than inside the engine so the record carries the seed
  // even if the run dies before returning — an unreproducible crash costs the
  // most.
  const seed = requestedSeed ?? Math.floor(Math.random() * 2_147_483_647)
  const resolvedGoals = goals ?? []
  const resolvedMemory = memory ?? {}

  const runId = await runStore.start({
    virtualUserId: virtualUser.id,
    disposition,
    seed,
    goals: resolvedGoals,
    memory: resolvedMemory,
    startedBy: startedBy ?? null,
  })

  return {
    runId,
    virtualUserId: virtualUser.id,
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
  virtualUserId: run.virtualUserId,
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
  virtualUsers: ScaffoldVirtualUsers
) => {
  const virtualUser = virtualUsers[schedule.virtualUserId]
  return {
    virtualUserId: schedule.virtualUserId,
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
      disposition: (virtualUser?.disposition ??
        'realistic') as VirtualUserDisposition,
      goals: virtualUser?.goals ?? [],
    },
  }
}

/**
 * What a request to create or change a virtual user's schedule carries. Omitted fields keep their current value.
 */
export interface WriteVirtualUserScheduleParams {
  store: VirtualUserScheduleStore | undefined
  virtualUsers: ScaffoldVirtualUsers
  virtualUserId: string
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
  /** The same three signals `startVirtualUserRun` reads to decide production. */
  config?: { nodeEnv?: string }
  environments?: Readonly<Record<string, VirtualUserEnvironment>>
  environment?: string
}

/**
 * Writes a virtual user's cadence.
 *
 * Applies the same rules `startVirtualUserRun` enforces, at the point the row is
 * written rather than every hour afterwards: an acted-upon virtual user has no
 * session, and production refuses every run, so either is a tick that can only
 * ever fail to start, with nobody watching.
 *
 * Whether the row is enabled is the one thing checked, since a field left out
 * keeps what it had: enabling a row saved earlier is refused just as saving a
 * new one would be.
 */
export const writeVirtualUserSchedule = async ({
  store,
  virtualUsers,
  virtualUserId,
  enabled,
  disposition,
  goals,
  budget,
  minIntervalMs,
  maxIntervalMs,
  nextRunAt,
  config,
  environments,
  environment = readEnvVariable('PIKKU_ENV'),
}: WriteVirtualUserScheduleParams): Promise<VirtualUserScheduleRecord> => {
  const scheduleStore = requireVirtualUserScheduleStore(store)
  const declared = runnableVirtualUser(virtualUsers, virtualUserId)
  const current =
    enabled === undefined || disposition === undefined
      ? await scheduleStore.get(virtualUserId)
      : null
  const created =
    disposition === undefined && !current ? declared.disposition : undefined
  if (enabled ?? current?.enabled) {
    refuseInProduction(virtualUserId, config, environments, environment)
  }
  return scheduleStore.set({
    virtualUserId,
    enabled,
    disposition: (disposition ?? created) as VirtualUserDisposition | undefined,
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
  virtualUserId: schedule.virtualUserId,
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
 * otherwise the only trace that a virtual user is still out there working.
 */
export const logVirtualUserTick = (
  logger: Logger,
  result: VirtualUserTickResult
): void => {
  for (const { virtualUserId, runId } of result.dispatched) {
    logger.info(
      `Virtual user ${virtualUserId} started run ${runId} on schedule`
    )
  }
  for (const runId of result.reaped) {
    logger.warn(
      `Virtual user run ${runId} was abandoned — marked failed so its virtual user can run again`
    )
  }
  for (const { virtualUserId, reason } of result.skipped) {
    logger.info(`Virtual user ${virtualUserId} skipped this tick: ${reason}`)
  }
}

/** What the scaffolded run worker needs to execute one recorded virtual-user run. */
export interface ExecuteVirtualUserRunParams {
  runStore: VirtualUserRunStore | undefined
  metaService: MetaService | undefined
  agentRunner: AgentRunnerService | undefined
  variables: VariablesService
  logger: Logger
  virtualUsers: ScaffoldVirtualUsers
  /** The app's generated `createVirtualUsers`, which knows its own virtual user ids. */
  createVirtualUsers: (
    options: Omit<HttpVirtualUsersConfig, 'virtualUsers'>
  ) => ScenarioVirtualUsers
  runId: string
  virtualUserId: string
  disposition: string
  goals: string[]
  memory: Record<string, string>
  seed: number
  budget?: {
    steps?: number
    mutations?: number
    durationMs?: number
  }
  /** The app's auth instance, which a run signs in through without a credential. */
  auth: InProcessAuth | undefined
}

/**
 * The run itself.
 *
 * Everything it needs is derived through `metaService` and the generated
 * virtual users — the same public surface any consumer has. Nothing reaches into
 * pikku's internals, because an app could not, and a feature built on what only
 * the framework can see would not be this feature.
 */
export const executeVirtualUserRun = async ({
  runStore,
  metaService,
  agentRunner,
  variables,
  logger,
  virtualUsers,
  createVirtualUsers,
  runId,
  virtualUserId,
  disposition,
  goals,
  memory,
  seed,
  budget,
  auth,
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
        `${VIRTUAL_USER_VARIABLES.apiUrl} is not set, so the virtual user has no address to drive. ` +
          `Set it to the URL this app is reached at, including any HTTP prefix (for example https://my-app.example.com/api). \`pikku dev\` sets it for you.`
      )
    }

    if (!auth) {
      throw new Error(
        'The app has no auth service, so the virtual user has no way to sign in. Register better-auth (with the pikkuVirtualUser plugin) as the auth singleton service.'
      )
    }

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

    const virtualUser = virtualUsers[virtualUserId]
    if (!virtualUser) {
      throw new Error(`VirtualUser "${virtualUserId}" is no longer declared`)
    }

    const { catalogue, intents, agents } = prepareVirtualUserRun({
      virtualUser,
      functionsMeta,
      schemas,
      workflowsMeta: await metaService.getWorkflowMeta(),
      systemRoles: await metaService.getSystemRolesMeta(),
      agentsMeta: await metaService.getAgentsMeta(),
    })

    const signedIn = createVirtualUsers({
      apiUrl,
      signIn: inProcessSignIn(auth),
      model,
      rpcPath:
        (await variables.get(VIRTUAL_USER_VARIABLES.rpcPath)) ?? undefined,
    })
    const target = signedIn[virtualUserId]
    if (!target) {
      throw new Error(`VirtualUser "${virtualUserId}" cannot sign in`)
    }

    const result = await runVirtualUserEngine({
      virtualUser,
      virtualUserId,
      disposition: disposition as VirtualUserDisposition,
      catalogue,
      intents,
      goals,
      memory,
      seed,
      agents,
      target: virtualUserTarget(target, {
        model,
        agents: agents.map((agent) => agent.name),
      }),
      // `AgentRunnerService.run` IS the engine's `VirtualUserLLM` — same params, same
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
    logger.error(
      `Virtual user run ${runId} (${virtualUserId}) failed: ${message}`
    )
    await store.fail(runId, message)
    throw error
  }
}
