import { runPikkuFunc } from '../../function/function-runner.js'
import {
  getSingletonServices,
  getCreateWireServices,
  pikkuState,
} from '../../pikku-state.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import { closeWireServices } from '../../utils.js'
import { PikkuError, addError } from '../../errors/error-handler.js'
import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { runScheduledTask } from '../scheduler/scheduler-runner.js'
import { WorkflowStepNameNotString } from './workflow-errors.js'
import type {
  RunLifecycleContext,
  WorkflowRunEngine,
  WorkflowRunExtension,
} from './workflow-run-engine.types.js'
import type { PikkuRawWire } from '../../types/core.types.js'
import type { ScenarioPersonas } from '../../services/personas-service.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type {
  ScenarioBrowserProvider,
  ScenarioEnvironment,
  ScenarioStepOptions,
  ScenarioStepPhase,
  ScenarioSurface,
} from './scenario-step.types.js'
import { resolveScenarioSurfaces, witnessesAgree } from './scenario-surface.js'
import type {
  PikkuScenarioWire,
  PikkuWorkflowWire,
  WorkflowExpectEventuallyOptions,
  WorkflowExpectErrorOptions,
  WorkflowExpectScoreOptions,
  WorkflowExpectServiceOptions,
  WorkflowQueueOptions,
} from './workflow.types.js'

/**
 * A workflow service with the scenario capability attached — the two lines
 * `pikku scenario run` needs, in one call so no caller has to remember that the
 * capability is installed rather than inherited.
 *
 * The in-memory service is the right engine because a scenario run is a single
 * external process driving a deployed app over its real transport: there is
 * nothing to persist and no second worker to resume it.
 */
export const createScenarioRunner = (
  options: WorkflowQueueOptions = {}
): {
  workflowService: InMemoryWorkflowService
  scenarioService: PikkuScenarioService
} => {
  const workflowService = new InMemoryWorkflowService(options)
  const scenarioService = workflowService.setRunExtension(
    (engine) => new PikkuScenarioService(engine)
  )
  return { workflowService, scenarioService }
}

/**
 * A scenario lifecycle callback, erased to its runtime shape. The typed form a
 * project writes against lives on the generated `pikkuScenario` config; by the
 * time the service reaches it, it is just a function taking the same three
 * arguments the scenario body takes.
 */
type ScenarioHook = (
  services: any,
  data: any,
  wire: PikkuRawWire
) => Promise<void> | void

/**
 * Everything a scenario step needs from the wire that created it. Passed as a
 * bundle so `given`/`when`/`then` stay one-liners.
 */
interface ScenarioStepContext {
  runId: string
  workflowName: string
  addonNamespace?: string | null
  workflowWire: PikkuScenarioWire
  rpcService: any
}

/**
 * A scenario's `before` or `after` hook threw. The original error is kept as
 * the `cause` so the failure that actually happened is never lost behind the
 * label saying which phase it happened in.
 */
export class ScenarioHookError extends PikkuError {
  constructor(
    public readonly scenarioName: string,
    public readonly phase: 'before' | 'after',
    cause: unknown
  ) {
    super(
      `Scenario '${scenarioName}' ${phase} hook failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    )
    this.cause = cause
  }
}
addError(ScenarioHookError, {
  status: 500,
  message: 'A scenario lifecycle hook failed.',
})

/**
 * Two witnesses of the same `then` disagreed.
 *
 * This is the failure the whole additive-witness design exists to produce: the
 * system of record is right and the surface the actor was looking at is not, or
 * the other way round. Both observations go in the message, because either one
 * alone reads as a passing assertion.
 */
export class ScenarioWitnessDisagreement extends PikkuError {
  constructor(
    public readonly stepFunc: string,
    public readonly expected: { surface: ScenarioSurface; observed: unknown },
    public readonly actual: { surface: ScenarioSurface; observed: unknown }
  ) {
    super(
      `Scenario step '${stepFunc}' observed different things on different surfaces — ` +
        `${expected.surface}: ${JSON.stringify(expected.observed)}, ` +
        `${actual.surface}: ${JSON.stringify(actual.observed)}.`
    )
  }
}
addError(ScenarioWitnessDisagreement, {
  status: 500,
  message: 'Two surfaces disagreed about what happened.',
})

/**
 * A step resolved to its browser binding but nothing can provide a browser.
 */
export class ScenarioBrowserUnavailable extends PikkuError {
  constructor(public readonly stepFunc: string) {
    super(
      `[scenario] step '${stepFunc}' resolved to its browser binding but no browser provider is registered. ` +
        `Install @pikku/playwright and register its provider, or run with --run default to take the server-side path.`
    )
  }
}
addError(ScenarioBrowserUnavailable, {
  status: 500,
  message: 'No browser provider is registered.',
})

/**
 * A browser binding was reached without an actor, so there is no persona whose
 * window it would run in.
 */
export class ScenarioBrowserActorRequired extends PikkuError {
  constructor(public readonly stepFunc: string) {
    super(
      `[scenario] step '${stepFunc}' resolved to its browser binding but was called without an actor. ` +
        `Pass { actor: actors.<name> } so the browser signs in as that persona.`
    )
  }
}
addError(ScenarioBrowserActorRequired, {
  status: 500,
  message: 'A browser binding needs an actor.',
})

/**
 * A step declares no binding the run can execute.
 *
 * Reached when a step has no `default` and the run targets a surface it does not
 * implement — an action step with nothing to run is a broken ladder, not a
 * coverage gap. (A `then` that ran somewhere, just not on the run surface, is
 * the coverage gap; it is reported rather than thrown. See
 * {@link ScenarioNoWitness} for one that ran nowhere.)
 */
export class ScenarioNoSurfaceBinding extends PikkuError {
  constructor(
    public readonly stepFunc: string,
    public readonly declared: ScenarioSurface[],
    public readonly runSurface: ScenarioSurface
  ) {
    super(
      `[scenario] step '${stepFunc}' declares no binding for '${runSurface}' and no 'default' to fall back to ` +
        `(declares: ${declared.join(', ') || 'nothing'}).`
    )
  }
}
addError(ScenarioNoSurfaceBinding, {
  status: 500,
  message: 'Step has no runnable binding for this surface.',
})

/**
 * An assertion had no witness this run could execute.
 *
 * Distinct from an unwitnessed `then`, which ran server-side and merely did not
 * look at the surface its prose claims. This one ran nowhere: without the throw
 * the step returns `undefined` and renders as a tick, reporting a pass for
 * something nobody checked. That is the exact failure the phase exists to
 * prevent, so it is fatal regardless of `--strict`.
 */
export class ScenarioNoWitness extends PikkuError {
  constructor(
    public readonly stepFunc: string,
    public readonly declared: ScenarioSurface[],
    public readonly runSurface: ScenarioSurface
  ) {
    super(
      `[scenario] assertion '${stepFunc}' has no witness to run on '${runSurface}' ` +
        `(declares: ${declared.join(', ') || 'nothing'}). Add a 'default' witness so the ` +
        `assertion is checked server-side even when the surface cannot check it.`
    )
  }
}
addError(ScenarioNoWitness, {
  status: 500,
  message: 'Assertion has no witness for this surface.',
})

/**
 * The scenario capability, layered onto a workflow service rather than being
 * one.
 *
 * Every scenario affordance — steps, actors, lifecycle hooks, the browser
 * provider, the assertion wire members — lives here rather than on
 * `PikkuWorkflowService`, because a bundler drops an unused *module* but never
 * an unused class member: anything declared on the workflow service ships in
 * every server built on Pikku, along with everything it imports. Scenarios only
 * ever run from `pikku scenario run`, so the whole surface stays behind an
 * import only that runner makes.
 *
 * It is not a workflow service because a scenario is not a different kind of
 * run — it is the same durable run with a step vocabulary on top. What it
 * needs from the engine it gets through the narrow `WorkflowRunEngine` handle,
 * which is why recording a step never became public API.
 *
 * ```ts
 * const workflowService = new InMemoryWorkflowService()
 * const scenarioService = workflowService.setRunExtension(
 *   (engine) => new PikkuScenarioService(engine)
 * )
 * ```
 */
export class PikkuScenarioService implements WorkflowRunExtension {
  // Scenario actors per run: live authenticated clients (cookie jars) are
  // process-local by nature, so they ride this map, never the persisted wire.
  private runActors = new Map<string, ScenarioPersonas>()
  // What each run has accumulated so far — process-local like the actors above,
  // so the body and its hooks share one object rather than reading it back off
  // the persisted wire.
  private runContexts = new Map<string, Record<string, unknown>>()
  private scenarioBrowserProvider?: ScenarioBrowserProvider
  private scenarioEnvironment?: ScenarioEnvironment
  private runSurface: ScenarioSurface = 'default'

  constructor(private readonly engine: WorkflowRunEngine) {}

  /**
   * The surface every actor drives the system through for this run, set once by
   * the runner from `--run`. `default` is the server-side path — the fast suite.
   */
  public setRunSurface(surface: ScenarioSurface) {
    this.runSurface = surface
  }

  public getRunSurface(): ScenarioSurface {
    return this.runSurface
  }

  /**
   * Registered by `@pikku/playwright` (or any other driver) before a scenario
   * runs. Absent means browser steps cannot run, which the CLI checks up front
   * so a run fails fast rather than mid-flow.
   */
  public setScenarioBrowserProvider(
    provider: ScenarioBrowserProvider | undefined
  ) {
    this.scenarioBrowserProvider = provider
  }

  public getScenarioBrowserProvider(): ScenarioBrowserProvider | undefined {
    return this.scenarioBrowserProvider
  }

  /**
   * The environment scenario steps run against, set once by the runner. It is
   * per-service rather than per-run because a runner process targets exactly
   * one environment for every scenario it executes.
   */
  public setScenarioEnvironment(env: ScenarioEnvironment | undefined) {
    this.scenarioEnvironment = env
  }

  public getScenarioEnvironment(): ScenarioEnvironment | undefined {
    return this.scenarioEnvironment
  }

  public async attachRunContext(
    runId: string,
    workflowMeta: any,
    options?: { actors?: ScenarioPersonas }
  ): Promise<void> {
    const actors =
      options?.actors ??
      (workflowMeta.source === 'scenario'
        ? await this.resolvePersonas()
        : undefined)
    if (actors) {
      this.runActors.set(runId, actors)
    }
    if (workflowMeta.source === 'scenario') {
      this.runContexts.set(runId, {})
    }
  }

  public detachRunContext(runId: string): void {
    this.runActors.delete(runId)
    this.runContexts.delete(runId)
  }

  /**
   * What the run has accumulated.
   *
   * Undefined only for a run whose wire was never decorated — decoration calls
   * `contextForRun` unconditionally, so a plain workflow that has reached a
   * step holds an empty context rather than none.
   */
  public getRunContext(runId: string): Record<string, unknown> | undefined {
    return this.runContexts.get(runId)
  }

  /**
   * The run's context, created on demand because the wire is also built on
   * paths that skip `attachRunContext`.
   */
  private contextForRun(runId: string): Record<string, unknown> {
    let runContext = this.runContexts.get(runId)
    if (!runContext) {
      runContext = {}
      this.runContexts.set(runId, runContext)
    }
    return runContext
  }

  public decorateRunWire(
    wire: PikkuRawWire,
    context: {
      runId: string
      workflowMeta: any
      workflowWire: PikkuWorkflowWire
    }
  ): void {
    wire.scenario =
      context.workflowMeta?.source === 'scenario'
        ? (context.workflowWire as PikkuScenarioWire)
        : undefined
    wire.actors = this.runActors.get(context.runId)
  }

  public async onBeforeRunFunc(context: RunLifecycleContext): Promise<void> {
    const hooks = this.scenarioHooks(context)
    if (!hooks?.before) return
    await this.runScenarioHook(
      'before',
      context.workflowMeta.name,
      hooks.before,
      context.wire,
      context.run.input,
      context.packageName
    )
  }

  public async onAfterRunFunc(
    context: RunLifecycleContext,
    outcome: 'completed' | 'failed' | 'interrupted',
    failure: unknown
  ): Promise<void> {
    if (outcome === 'interrupted') return
    const hooks = this.scenarioHooks(context)
    if (!hooks?.after) return

    const { runId, run, workflowMeta } = context
    try {
      await this.runScenarioHook(
        'after',
        workflowMeta.name,
        hooks.after,
        context.wire,
        run.input,
        context.packageName
      )
    } catch (hookError: any) {
      if (outcome === 'failed') {
        // The scenario already failed for its own reason; a teardown failure is
        // diagnostic context, never the headline.
        if (failure instanceof Error && failure.cause === undefined) {
          failure.cause = hookError
        }
        getSingletonServices()?.logger.error(
          `Scenario ${workflowMeta.name} (run ${runId}) failed, and its after hook also failed:`,
          hookError
        )
      } else {
        await this.engine.updateRunStatus(runId, 'failed', undefined, {
          message: hookError.message,
          stack: hookError.stack,
          code: hookError.code,
        })
        await this.engine.onChildWorkflowFailed(run, hookError)
        throw hookError
      }
    }
  }

  /**
   * Hooks are a scenario affordance only: a plain workflow is durable and
   * resumable, so a callback that reruns on every replay has no honest meaning
   * there.
   */
  private scenarioHooks(
    context: RunLifecycleContext
  ): { before?: ScenarioHook; after?: ScenarioHook } | undefined {
    return context.workflowMeta.source === 'scenario'
      ? (context.workflow.func as {
          before?: ScenarioHook
          after?: ScenarioHook
        })
      : undefined
  }

  /**
   * Run a scenario `before`/`after` hook.
   *
   * A hook is not a pikku function: it has no id, no meta and no schema, so it
   * cannot go through `runPikkuFunc` and the runner records nothing for it. It
   * gets exactly what the scenario body gets — the same wire (so `actors` is
   * how it reaches the app), and singleton services composed with this
   * invocation's wire services — and nothing else.
   */
  private async runScenarioHook(
    phase: 'before' | 'after',
    scenarioName: string,
    hook: ScenarioHook,
    wire: PikkuRawWire,
    data: unknown,
    packageName: string | null
  ): Promise<void> {
    const singletonServices = getSingletonServices()!
    let createWireServices = getCreateWireServices()
    if (packageName) {
      const factories = pikkuState(packageName, 'package', 'factories')
      if (factories?.createWireServices) {
        createWireServices = factories.createWireServices
      }
    }

    let wireServices: Record<string, unknown> | undefined
    try {
      wireServices = (await createWireServices?.(singletonServices, wire)) as
        | Record<string, unknown>
        | undefined
      const services =
        wireServices && Object.keys(wireServices).length > 0
          ? { ...singletonServices, ...wireServices }
          : singletonServices
      await hook(services, data, wire)
    } catch (error) {
      throw new ScenarioHookError(scenarioName, phase, error)
    } finally {
      if (wireServices && Object.keys(wireServices).length > 0) {
        await closeWireServices(singletonServices.logger, wireServices)
      }
    }
  }

  /**
   * Build HTTP scenario actors for a run started without them; undefined when
   * SCENARIO_ACTOR_SECRET or the API URL is missing.
   *
   * The actor client is imported lazily so that even a runner bundle only pays
   * for the AI persona conversation loop it pulls in when a scenario actually
   * signs an actor in.
   */
  public async resolvePersonas(): Promise<ScenarioPersonas | undefined> {
    const services = getSingletonServices()
    const variables = services?.variables
    const metaService = services?.metaService
    if (!variables || !metaService) {
      return undefined
    }
    const secret = await variables.get('SCENARIO_ACTOR_SECRET')
    const apiUrl = await variables.get('API_URL')
    if (!secret || !apiUrl) {
      services?.logger?.warn(
        'A scenario was started without personas but SCENARIO_ACTOR_SECRET / API_URL is not configured — running without them.'
      )
      return undefined
    }
    const personas = await metaService.getPersonasMeta()
    if (!personas || Object.keys(personas).length === 0) {
      return undefined
    }
    const signInPath =
      (await variables.get('SCENARIO_SIGN_IN_PATH')) ??
      '/api/auth/sign-in/actor'
    const rpcPath = (await variables.get('SCENARIO_RPC_PATH')) ?? '/rpc'
    // A run started outside the CLI still targets an environment — its own.
    this.scenarioEnvironment ??= {
      apiUrl,
      appUrl: (await variables.get('APP_URL')) ?? undefined,
    }
    const { createHttpPersonas } =
      await import('../../services/http-personas.js')
    return createHttpPersonas({
      apiUrl,
      secret,
      personas,
      signInPath,
      rpcPath,
    })
  }

  public decorateWorkflowWire(
    wire: PikkuWorkflowWire,
    context: {
      name: string
      runId: string
      rpcService: any
      addonNamespace?: string | null
    }
  ): void {
    const { name, runId, rpcService, addonNamespace } = context
    const workflowWire = wire as PikkuScenarioWire
    const scenarioStepContext = (): ScenarioStepContext => ({
      runId,
      workflowName: name,
      addonNamespace,
      workflowWire,
      rpcService,
    })
    Object.assign(workflowWire, {
      context: this.contextForRun(runId),

      // Durable polling step: invoke an RPC (as an actor when options.as is
      // set) until the predicate passes or `within` elapses. The whole poll is
      // ONE recorded step, so replay returns the cached outcome.
      expectEventually: async (
        stepName: string,
        rpcName: string,
        data: any,
        predicate: (output: any) => boolean,
        options?: WorkflowExpectEventuallyOptions
      ) => {
        this.engine.verifyStepName(stepName)
        const resolvedRpcName =
          addonNamespace && !rpcName.includes(':')
            ? `${addonNamespace}:${rpcName}`
            : rpcName
        const within = getDurationInMilliseconds(options?.within ?? '30s')
        const interval = getDurationInMilliseconds(options?.interval ?? '1s')
        return await this.engine.inlineStep(
          runId,
          stepName,
          async () => {
            const deadline = Date.now() + within
            let last: any
            while (true) {
              last = options?.actor
                ? await options.actor.invoke(resolvedRpcName, data)
                : await rpcService.rpcWithWire(resolvedRpcName, data, {})
              if (predicate(last)) return last
              if (Date.now() + interval > deadline) {
                throw new Error(
                  `[workflow] expectEventually '${stepName}' ('${resolvedRpcName}'` +
                    `${options?.actor ? ` as '${options.actor.name}'` : ''}) did not pass within ${within}ms; ` +
                    `last result: ${JSON.stringify(last)?.slice(0, 300)}`
                )
              }
              await new Promise((resolve) => setTimeout(resolve, interval))
            }
          },
          options
        )
      },

      expectError: async (
        stepName: string,
        rpcName: string,
        data: any,
        options?: WorkflowExpectErrorOptions
      ) => {
        this.engine.verifyStepName(stepName)
        const resolvedRpcName =
          addonNamespace && !rpcName.includes(':')
            ? `${addonNamespace}:${rpcName}`
            : rpcName
        return await this.engine.inlineStep(
          runId,
          stepName,
          async () => {
            let result: any
            try {
              result = options?.actor
                ? await options.actor.invoke(resolvedRpcName, data)
                : await rpcService.rpcWithWire(resolvedRpcName, data, {})
            } catch (e: any) {
              const message = e?.message ?? String(e)
              if (options?.matches) {
                const matched =
                  typeof options.matches === 'string'
                    ? message.includes(options.matches)
                    : options.matches.test(message)
                if (!matched) {
                  throw new Error(
                    `[workflow] expectError '${stepName}' ('${resolvedRpcName}') threw, but the message did not match ${options.matches}: ${message}`
                  )
                }
              }
              return message
            }
            throw new Error(
              `[workflow] expectError '${stepName}' ('${resolvedRpcName}') expected an error but the call succeeded: ${JSON.stringify(result)?.slice(0, 300)}`
            )
          },
          options
        )
      },

      expectService: async (
        stepName: string,
        serviceMethod: string,
        options?: WorkflowExpectServiceOptions
      ) => {
        this.engine.verifyStepName(stepName)
        const [service, method] = serviceMethod.split('.')
        if (!service || !method) {
          throw new Error(
            `[workflow] expectService '${stepName}' needs 'service.method', got '${serviceMethod}'`
          )
        }
        await this.engine.inlineStep(
          runId,
          stepName,
          async () => {
            const rpcName = 'pikkuScenarioGetStubCalls'
            const calls: Array<{
              service: string
              method: string
              args: unknown[]
            }> = options?.actor
              ? await options.actor.invoke(rpcName, { service })
              : await rpcService.rpcWithWire(rpcName, { service }, {})
            const matching = (calls ?? []).filter(
              (c) =>
                c.service === service &&
                c.method === method &&
                (options?.calledWith === undefined ||
                  JSON.stringify(c.args?.[0]) ===
                    JSON.stringify(options.calledWith))
            )
            const expected = options?.times
            const ok =
              expected === undefined
                ? matching.length > 0
                : matching.length === expected
            if (!ok) {
              const seen =
                (calls ?? [])
                  .map(
                    (c) =>
                      `${c.service}.${c.method}(${JSON.stringify(c.args?.[0])?.slice(0, 120) ?? ''})`
                  )
                  .join('\n  ') || '(none)'
              throw new Error(
                `[workflow] expectService '${stepName}' expected ${expected ?? 'at least one'} call(s) to '${serviceMethod}'` +
                  `${options?.calledWith !== undefined ? ` with ${JSON.stringify(options.calledWith)}` : ''}, found ${matching.length}. Recorded:\n  ${seen}`
              )
            }
          },
          options
        )
      },

      expectScore: async (
        stepName: string,
        agentRunId: string,
        scorerName: string,
        options?: WorkflowExpectScoreOptions
      ) => {
        this.engine.verifyStepName(stepName)
        return await this.engine.inlineStep(
          runId,
          stepName,
          async () => {
            const rpcName = 'pikkuScenarioGradeRun'
            const data = {
              runId: agentRunId,
              scorer: scorerName,
              ...(options?.reference !== undefined
                ? { reference: options.reference }
                : {}),
            }
            const grade: { score: number; reason?: string } = options?.actor
              ? await options.actor.invoke(rpcName, data)
              : await rpcService.rpcWithWire(rpcName, data, {})

            // A scorer that graded is a scorer that answered, so an unstated
            // bound still fails a zero rather than passing anything at all.
            const atLeast = options?.atLeast ?? 0.5
            const failed =
              grade.score < atLeast ||
              (options?.atMost !== undefined && grade.score > options.atMost)
            if (failed) {
              const bound =
                options?.atMost !== undefined
                  ? `between ${atLeast} and ${options.atMost}`
                  : `at least ${atLeast}`
              throw new Error(
                `[workflow] expectScore '${stepName}' expected '${scorerName}' to grade run ${agentRunId} ${bound}, got ${grade.score}` +
                  `${grade.reason ? `: ${grade.reason}` : ''}`
              )
            }
            return grade
          },
          options
        )
      },

      // knowledge: decisions/internals/scenario-given-and-when-are-sugar-but-then-is-not.md
      given: (stepName, stepFunc, data, options) =>
        this.scenarioStep(
          'given',
          scenarioStepContext(),
          stepName,
          stepFunc,
          data,
          options
        ),
      when: (stepName, stepFunc, data, options) =>
        this.scenarioStep(
          'when',
          scenarioStepContext(),
          stepName,
          stepFunc,
          data,
          options
        ),
      then: (stepName, stepFunc, data, options) =>
        this.scenarioStep(
          'then',
          scenarioStepContext(),
          stepName,
          stepFunc,
          data,
          options
        ),

      runScheduledTask: async (taskName: string) => {
        await runScheduledTask({ name: taskName })
      },
    } satisfies Omit<PikkuScenarioWire, keyof PikkuWorkflowWire>)
  }

  private async scenarioStep(
    phase: ScenarioStepPhase,
    context: ScenarioStepContext,
    stepName: string,
    stepFunc: string,
    data?: any,
    options?: ScenarioStepOptions
  ): Promise<any> {
    const { runId, workflowName, addonNamespace, workflowWire } = context
    // Also the guard for `then` being a wire member: an accidental
    // `await scenario` calls it with a resolve function, which lands here as a
    // loud, named error instead of a silent hang.
    this.engine.verifyStepName(stepName)
    if (typeof stepFunc !== 'string') {
      throw new WorkflowStepNameNotString(stepFunc)
    }

    const packageName =
      addonNamespace && !stepFunc.includes(':') ? addonNamespace : null
    const resolvedStepFunc =
      addonNamespace && !stepFunc.includes(':')
        ? `${addonNamespace}:${stepFunc}`
        : stepFunc

    const actor = options?.actor as ScenarioPersonas[string] | undefined
    const description =
      options?.description ??
      this.scenarioStepDescription(packageName, resolvedStepFunc) ??
      stepName

    const declared = this.declaredSurfaces(packageName, resolvedStepFunc)
    const resolution = resolveScenarioSurfaces(phase, declared, this.runSurface)

    return await this.engine.inlineStep(
      runId,
      stepName,
      async () => {
        const runOnSurface = async (surface: ScenarioSurface) => {
          // No `rpc` yet — runPikkuFunc attaches it lazily for the invocation.
          const wire: PikkuRawWire = {
            workflow: workflowWire,
            scenario: workflowWire,
            pikkuUserId: workflowWire.pikkuUserId,
            actors: this.runActors.get(runId),
            scenarioStep: {
              name: resolvedStepFunc,
              stepName,
              runId,
              phase,
              surface,
              actor,
              env: this.scenarioEnvironment,
            },
          }
          if (surface === 'browser') {
            if (!this.scenarioBrowserProvider) {
              throw new ScenarioBrowserUnavailable(resolvedStepFunc)
            }
            if (!actor) {
              throw new ScenarioBrowserActorRequired(resolvedStepFunc)
            }
            wire.browser = await this.scenarioBrowserProvider.sessionFor(
              actor.name
            )
          }
          return await runPikkuFunc(
            'workflow',
            workflowName,
            resolvedStepFunc,
            {
              singletonServices: getSingletonServices()!,
              createWireServices: getCreateWireServices(),
              data: () => data,
              wire,
              packageName: packageName ?? undefined,
            }
          )
        }

        if (resolution.kind === 'action') {
          if (resolution.fellBack && !declared.includes('default')) {
            throw new ScenarioNoSurfaceBinding(
              resolvedStepFunc,
              declared,
              this.runSurface
            )
          }
          return await runOnSurface(resolution.surface)
        }

        if (resolution.surfaces.length === 0) {
          throw new ScenarioNoWitness(
            resolvedStepFunc,
            declared,
            this.runSurface
          )
        }

        // A `then` runs every witness it has and they must agree. The surface
        // witness runs first so that when the page is the thing that is wrong,
        // it is the failure that surfaces.
        let first: { surface: ScenarioSurface; observed: unknown } | undefined
        for (const surface of resolution.surfaces) {
          const observed = await runOnSurface(surface)
          if (!first) {
            first = { surface, observed }
            continue
          }
          if (!witnessesAgree(first.observed, observed)) {
            throw new ScenarioWitnessDisagreement(resolvedStepFunc, first, {
              surface,
              observed,
            })
          }
          // Keep whichever witness actually reported a value, so a step pairing
          // a returning witness with a throwing one still records an output.
          if (first.observed === undefined) {
            first = { surface, observed }
          }
        }
        return first?.observed
      },
      {
        description,
        // Retrying a failed assertion is the wrong behaviour for a test
        // primitive, so steps opt out of the workflow-wide retry default.
        retries: options?.retries ?? 0,
        retryDelay: options?.retryDelay,
      },
      data,
      resolvedStepFunc
    )
  }

  private scenarioStepConfig(
    packageName: string | null,
    stepFunc: string
  ): CorePikkuFunctionConfig<any, any> | undefined {
    const localName =
      packageName && stepFunc.startsWith(`${packageName}:`)
        ? stepFunc.slice(packageName.length + 1)
        : stepFunc
    return pikkuState(packageName, 'function', 'functions').get(localName)
  }

  private scenarioStepDescription(
    packageName: string | null,
    stepFunc: string
  ): string | undefined {
    return this.scenarioStepConfig(packageName, stepFunc)?.description
  }

  /**
   * Which surfaces a step declares a binding for. A step that declares none is
   * treated as server-side only, which is what an ordinary function is.
   */
  private declaredSurfaces(
    packageName: string | null,
    stepFunc: string
  ): ScenarioSurface[] {
    const surfaces = this.scenarioStepConfig(packageName, stepFunc)?.surfaces
    return surfaces?.length ? surfaces : ['default']
  }
}
