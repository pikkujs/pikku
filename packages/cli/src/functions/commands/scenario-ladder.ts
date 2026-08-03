/**
 * The scenario step ladder — joining a recorded run back to the English that
 * declared it.
 *
 * Cucumber parsed English into calls; this recovers English out of the typed
 * calls the inspector already recorded, joined against the run the engine
 * already persisted. No engine change, no step-event bus. Layout of the result
 * belongs to `scenario-formatter.ts`; this module only decides what each step
 * is called.
 */
import { composeStepProse } from '@pikku/core/workflow'
import type { ScenarioStepPhase, ScenarioSurface } from '@pikku/core/workflow'
import type { WorkflowStepMeta } from '@pikku/core/workflow/types'
import type { FunctionsMeta } from '@pikku/core'
import { KEYWORD_WIDTH } from './scenario-formatter.js'
import type {
  ScenarioFailureDetail,
  ScenarioStepRow,
} from './scenario-formatter.js'

export interface ScenarioStepProse {
  phase: ScenarioStepPhase
  description: string
  template?: string
  actor?: string
}

export interface ScenarioStepOutcome {
  stepName: string
  status: string
  durationMs?: number
  error?: string
  /** The failing error's stack, as recorded on the run. */
  stack?: string
  /**
   * True when the failure was a deliberate one (a PikkuError). Its message is
   * the whole story, so the stack is noise.
   */
  expected?: boolean
  /** The input this step was called with, as recorded on the run. */
  input?: unknown
  /** The step function that ran it, as recorded on the run. */
  stepFunc?: string
}

/**
 * One scenario's prose, indexed the two ways a run step can be joined back to
 * its declaration.
 */
export interface ScenarioProse {
  byStepName: Map<string, ScenarioStepProse>
  /**
   * The same prose keyed by step function, for steps whose durable name the
   * static meta cannot predict: a step called in a loop is declared as
   * `sees ${packageName}` and reaches the run as `sees @pikku/addon-todos`.
   *
   * A function called from several sites that do not agree on their prose is
   * left out rather than guessed at — such a step falls back to its bare name,
   * which is what it did before this index existed.
   */
  byStepFunc: Map<string, ScenarioStepProse>
}

/**
 * Walk a workflow's steps — including the ones nested inside branches, fanouts
 * and parallel groups — and yield every scenario step it declares.
 */
function* walkScenarioSteps(steps: unknown): Generator<any> {
  if (!Array.isArray(steps)) {
    return
  }
  for (const step of steps as WorkflowStepMeta[]) {
    const node = step as any
    if (node?.type === 'scenarioStep') {
      yield node
      continue
    }
    yield* walkScenarioSteps(node?.children)
    yield* walkScenarioSteps(node?.body)
    yield* walkScenarioSteps(node?.steps)
    yield* walkScenarioSteps(node?.then)
    yield* walkScenarioSteps(node?.else)
    for (const branch of Object.values(node?.cases ?? {})) {
      yield* walkScenarioSteps(branch)
    }
  }
}

/**
 * Build `durable step name → prose parts` for one scenario.
 *
 * Description precedence matches the runtime: the call site's `description`
 * wins, then the step's own declared `description`, then the positional step
 * name. A step's `template` is carried alongside and, when it exists, is what
 * actually gets rendered — filled from the input recorded on the run.
 */
export const collectScenarioStepProse = (
  workflowMeta: { steps?: WorkflowStepMeta[] } | undefined,
  functionsMeta: FunctionsMeta
): ScenarioProse => {
  const byStepName = new Map<string, ScenarioStepProse>()
  const byStepFunc = new Map<string, ScenarioStepProse>()
  const ambiguous = new Set<string>()
  for (const step of walkScenarioSteps(workflowMeta?.steps)) {
    const stepMeta = functionsMeta[step.stepFunc]
    const parts: ScenarioStepProse = {
      phase: step.phase,
      description:
        step.options?.description ?? stepMeta?.description ?? step.stepName,
      // A call-site description is an explicit override, so it wins over the
      // step's template the same way it wins over its description.
      template: step.options?.description
        ? undefined
        : stepMeta?.scenarioStepTemplate,
      actor: step.actor,
    }
    byStepName.set(step.stepName, parts)

    const declared = byStepFunc.get(step.stepFunc)
    if (declared && !sameProse(declared, parts)) {
      ambiguous.add(step.stepFunc)
    } else {
      byStepFunc.set(step.stepFunc, parts)
    }
  }
  for (const stepFunc of ambiguous) {
    byStepFunc.delete(stepFunc)
  }
  return { byStepName, byStepFunc }
}

const sameProse = (a: ScenarioStepProse, b: ScenarioStepProse) =>
  a.phase === b.phase &&
  a.description === b.description &&
  a.template === b.template &&
  a.actor === b.actor

/** The step functions in this scenario that declare a `browser` binding. */
export const scenarioBrowserSteps = (
  workflowMeta: { steps?: WorkflowStepMeta[] } | undefined,
  functionsMeta: FunctionsMeta
): string[] => {
  const names = new Set<string>()
  for (const step of walkScenarioSteps(workflowMeta?.steps)) {
    if (
      functionsMeta[step.stepFunc]?.scenarioStepSurfaces?.includes('browser')
    ) {
      names.add(step.stepFunc)
    }
  }
  return [...names]
}

/**
 * Steps this scenario cannot run on `surface` at all — they declare neither a
 * binding for it nor a `default` to fall back to.
 *
 * Every phase counts. An action with nothing to run is a broken ladder; an
 * assertion with nothing to run would report a pass having checked nothing,
 * which the engine now refuses outright. Both are better caught here, so the
 * flow is held back with a reason than failed halfway through.
 *
 * A step that *can* run, just not on the run surface, is the different case — a
 * coverage gap, counted by {@link scenarioSurfaceCoverage} rather than a reason
 * to skip.
 */
export const scenarioStepsWithoutBinding = (
  workflowMeta: { steps?: WorkflowStepMeta[] } | undefined,
  functionsMeta: FunctionsMeta,
  surface: ScenarioSurface
): string[] => {
  const names = new Set<string>()
  for (const step of walkScenarioSteps(workflowMeta?.steps)) {
    const surfaces = functionsMeta[step.stepFunc]?.scenarioStepSurfaces ?? [
      'default',
    ]
    if (!surfaces.includes(surface) && !surfaces.includes('default')) {
      names.add(step.stepFunc)
    }
  }
  return [...names]
}

/**
 * How much of this scenario actually ran on the surface the run targeted.
 *
 * Every step counts, not just the assertions. A ladder of
 * `browser/browser/default/browser` is 3/4 — the step that fell back to the
 * server shows up by lowering the ratio, which is a truer signal than a green
 * assertion count with a footnote. It also makes surfaces comparable: the same
 * scenario is 4/4 on a default run and 3/4 on a browser one, over one
 * denominator.
 *
 * Assertions still get named separately. A `given` or `when` driven server-side
 * took a shortcut; a `then` driven server-side is a sentence claiming the actor
 * saw something nobody looked at. Same effect on the ratio, different kind of
 * problem, so `--strict` gates on the latter only.
 */
export interface ScenarioSurfaceCoverage {
  /** Steps that ran on the run surface. */
  onSurface: number
  /** Steps that ran at all. */
  total: number
  /** The `then` steps that ran, but somewhere other than the run surface. */
  unwitnessed: string[]
}

export const scenarioSurfaceCoverage = (
  workflowMeta: { steps?: WorkflowStepMeta[] } | undefined,
  functionsMeta: FunctionsMeta,
  runSurface: ScenarioSurface
): ScenarioSurfaceCoverage => {
  let onSurface = 0
  let total = 0
  const unwitnessed = new Set<string>()
  for (const step of walkScenarioSteps(workflowMeta?.steps)) {
    const surfaces = functionsMeta[step.stepFunc]?.scenarioStepSurfaces ?? [
      'default',
    ]
    // A step with no binding this run can execute never runs, so it is not a
    // statistic about this run — `scenarioStepsWithoutBinding` holds the flow
    // back for it. Counting it here would score a run on work it refuses to do.
    if (!surfaces.includes(runSurface) && !surfaces.includes('default')) {
      continue
    }
    total += 1
    if (runSurface === 'default' || surfaces.includes(runSurface)) {
      onSurface += 1
    } else if (step.phase === 'then') {
      unwitnessed.add(step.stepFunc)
    }
  }
  return { onSurface, total, unwitnessed: [...unwitnessed] }
}

/**
 * Render one step's gherkin sentence.
 *
 * A repeated step is stored as `name#1`; its prose lives under the bare name.
 * Only once neither name matches does the step function decide it, so a step
 * recorded under the name it was declared with is never re-resolved by a
 * function shared with another call site.
 */
const stepSentence = (
  step: ScenarioStepOutcome,
  prose: ScenarioProse
): string => {
  const parts =
    prose.byStepName.get(step.stepName) ??
    prose.byStepName.get(baseName(step.stepName)) ??
    (step.stepFunc ? prose.byStepFunc.get(step.stepFunc) : undefined)
  return parts
    ? composeStepProse({
        ...parts,
        input: step.input,
        keywordWidth: KEYWORD_WIDTH,
      })
    : `${''.padEnd(KEYWORD_WIDTH)} ${step.stepName}`
}

/** The run's steps as renderable rows, in the order they were recorded. */
export const scenarioStepRows = (
  steps: ScenarioStepOutcome[],
  prose: ScenarioProse
): ScenarioStepRow[] =>
  steps.map((step) => ({
    sentence: stepSentence(step, prose),
    status: step.status,
    durationMs: step.durationMs,
    error: step.error,
  }))

const baseName = (stepName: string) => stepName.replace(/#\d+$/, '')

/**
 * Find the step a run died on and join it back to its declared prose, so a
 * failure names the sentence a reader recognises rather than a durable key.
 */
export const scenarioFailureFromSteps = (
  steps: ScenarioStepOutcome[],
  prose: ScenarioProse
): ScenarioFailureDetail | undefined => {
  const failed = steps.find((step) => step.status !== 'succeeded')
  if (!failed) {
    return undefined
  }
  return {
    sentence: stepSentence(failed, prose).trimEnd(),
    message: failed.error ?? `step status: ${failed.status}`,
    stack: failed.stack,
    expected: failed.expected,
  }
}
