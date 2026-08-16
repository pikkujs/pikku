import type { FunctionMeta } from '@pikku/core/services'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { toEnglishName } from '../../lib/strings'
import type { PersonaScenarioRef } from './persona-types'
import type { SubjectEntry, SubjectStepRef } from './subject-types'

export interface SubjectModelInput {
  functions: FunctionMeta[]
  workflows: WorkflowsMeta
  features: Record<string, { name: string; entries?: { scenario: string }[] }>
}

/**
 * The reading model for the actors that are not people.
 *
 * The platform is built in rather than derived: a project that has never
 * written `pikkuPlatformScenarioStep` still has a platform, and a card that
 * appeared the moment somebody declared their first step would read as a
 * feature they had switched on. An addon is the opposite — it is only a subject
 * in this product because a step says its system acts here.
 */

/** A scenario workflow that is a real scenario rather than a suite fixture. */
const isScenario = (workflow: any): boolean =>
  (workflow.source === 'scenario' || workflow.scenario === true) &&
  !(workflow.tags ?? []).includes('test-fixture')

/**
 * Every step function a workflow calls, however deeply the control flow buries
 * it. Branches, parallel groups, fanouts and switches all nest step arrays, and
 * a subject invoked inside an `if` is no less invoked.
 */
const stepFuncsIn = (node: unknown, found: Set<string>): Set<string> => {
  if (Array.isArray(node)) {
    for (const child of node) stepFuncsIn(child, found)
    return found
  }
  if (!node || typeof node !== 'object') return found
  const step = node as Record<string, unknown>
  if (step.type === 'scenarioStep' && typeof step.stepFunc === 'string') {
    found.add(step.stepFunc)
  }
  for (const value of Object.values(step)) {
    if (value && typeof value === 'object') stepFuncsIn(value, found)
  }
  return found
}

const stepRef = (func: FunctionMeta): SubjectStepRef => ({
  name: func.name!,
  displayName: toEnglishName(func.name!),
  sourceFile: func.sourceFile,
})

export const toSubjectEntries = ({
  functions,
  workflows,
  features,
}: SubjectModelInput): SubjectEntry[] => {
  const featureByScenario = new Map<string, string>()
  for (const feature of Object.values(features ?? {}) as any[]) {
    for (const entry of feature.entries ?? []) {
      featureByScenario.set(entry.scenario, feature.name)
    }
  }

  const platformSteps: SubjectStepRef[] = []
  const addonSteps = new Map<string, SubjectStepRef[]>()
  for (const func of functions ?? []) {
    if (!func?.name) continue
    if (func.scenarioStepKind === 'platform') {
      platformSteps.push(stepRef(func))
    } else if (func.scenarioStepKind === 'addon' && func.scenarioStepAddon) {
      const declared = addonSteps.get(func.scenarioStepAddon) ?? []
      declared.push(stepRef(func))
      addonSteps.set(func.scenarioStepAddon, declared)
    }
  }

  const scenarioSteps = new Map<string, Set<string>>()
  for (const workflow of Object.values(workflows ?? {}) as any[]) {
    if (!isScenario(workflow)) continue
    scenarioSteps.set(workflow.name, stepFuncsIn(workflow.steps, new Set()))
  }

  const reachOf = (steps: SubjectStepRef[]) => {
    const declared = new Set(steps.map((step) => step.name))
    const scenarios: PersonaScenarioRef[] = []
    const owned = new Set<string>()
    for (const workflow of Object.values(workflows ?? {}) as any[]) {
      if (!isScenario(workflow)) continue
      const called = scenarioSteps.get(workflow.name)
      if (![...declared].some((name) => called?.has(name))) continue
      scenarios.push({
        name: workflow.name,
        displayName: workflow.title ?? toEnglishName(workflow.name),
      })
      const feature = featureByScenario.get(workflow.name)
      if (feature) owned.add(feature)
    }
    scenarios.sort((a, b) => a.name.localeCompare(b.name))
    return { scenarios, features: [...owned].sort() }
  }

  const platform: SubjectEntry = {
    kind: 'platform',
    key: 'platform',
    name: 'platform',
    steps: platformSteps,
    ...reachOf(platformSteps),
  }

  const addons = [...addonSteps.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([addon, steps]): SubjectEntry => {
      return {
        kind: 'addon',
        key: `addon:${addon}`,
        name: addon,
        addon,
        steps,
        ...reachOf(steps),
      }
    })

  return [platform, ...addons]
}
