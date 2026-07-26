/**
 * The scenario step ladder — the readable report that replaces cucumber's
 * gherkin output.
 *
 * Cucumber parsed English into calls; this renders English out of the typed
 * calls the inspector already recorded, joined against the run the engine
 * already persisted. No engine change, no step-event bus.
 */
import { composeStepProse } from '@pikku/core/workflow'
import type { ScenarioStepPhase } from '@pikku/core/workflow'
import type { WorkflowStepMeta } from '@pikku/core/workflow/types'
import type { FunctionsMeta } from '@pikku/core'

/** The longest gherkin keyword ("Given"), so sentences line up under each other. */
const KEYWORD_WIDTH = 5

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
      phase: step.phase ?? 'step',
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

/** The step functions in this scenario that declare `browser: true`. */
export const scenarioBrowserSteps = (
  workflowMeta: { steps?: WorkflowStepMeta[] } | undefined,
  functionsMeta: FunctionsMeta
): string[] => {
  const names = new Set<string>()
  for (const step of walkScenarioSteps(workflowMeta?.steps)) {
    if (functionsMeta[step.stepFunc]?.scenarioStepBrowser === true) {
      names.add(step.stepFunc)
    }
  }
  return [...names]
}

export const buildStepLadder = (
  steps: ScenarioStepOutcome[],
  prose: ScenarioProse
): string[] => {
  const rendered = steps.map((step) => {
    // A repeated step is stored as `name#1`; its prose lives under the bare
    // name. Only once neither name matches does the step function decide it,
    // so a step recorded under the name it was declared with is never
    // re-resolved by a function shared with another call site.
    const parts =
      prose.byStepName.get(step.stepName) ??
      prose.byStepName.get(baseName(step.stepName)) ??
      (step.stepFunc ? prose.byStepFunc.get(step.stepFunc) : undefined)
    const sentence = parts
      ? composeStepProse({
          ...parts,
          input: step.input,
          keywordWidth: KEYWORD_WIDTH,
        })
      : `${''.padEnd(KEYWORD_WIDTH)} ${step.stepName}`
    return { step, sentence }
  })

  const width = Math.max(0, ...rendered.map(({ sentence }) => sentence.length))
  return rendered.map(({ step, sentence }) => {
    const glyph = step.status === 'succeeded' ? '✓' : '✗'
    const detail =
      step.status === 'succeeded' || !step.error
        ? formatDuration(step.durationMs)
        : step.error
    return `  ${sentence.padEnd(width)}  ${glyph}  ${detail}`
  })
}

const baseName = (stepName: string) => stepName.replace(/#\d+$/, '')

const formatDuration = (durationMs?: number) => {
  if (durationMs === undefined) {
    return ''
  }
  return durationMs < 1000
    ? `${durationMs}ms`
    : `${(durationMs / 1000).toFixed(1)}s`
}
