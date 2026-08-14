import type { FunctionsMeta } from '@pikku/core/ecosystem/services'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

export type WiringFileMap = Map<string, { path: string; exportedName: string }>

/**
 * Scenario steps and scenarios are ordinary pikku functions and workflows, so
 * without a split they register into the same bootstrap a deployed server
 * imports — dragging every step body (and whatever it imports: Playwright, test
 * fixtures, assertion helpers) into production. These partitions are what keep
 * them in `.pikku/scenarios/`, reachable only from `pikku scenario run`.
 */
export const isScenarioStep = (
  meta: FunctionsMeta[string] | undefined
): boolean => meta?.scenarioStep === true

/**
 * A scenario's own body is a function too, so the app meta used to carry every
 * scenario's name, schemas and hashes — and a deployed bundle imports that meta
 * wholesale. Both kinds belong on the scenario side of the split.
 */
export const isScenarioFunction = (
  meta: FunctionsMeta[string] | undefined
): boolean => isScenarioStep(meta) || meta?.scenario === true

export const partitionScenarioFunctions = (
  files: WiringFileMap,
  functionsMeta: FunctionsMeta
): { app: WiringFileMap; scenario: WiringFileMap } => {
  const app: WiringFileMap = new Map()
  const scenario: WiringFileMap = new Map()
  for (const [name, entry] of files) {
    if (isScenarioFunction(functionsMeta[name])) {
      scenario.set(name, entry)
    } else {
      app.set(name, entry)
    }
  }
  return { app, scenario }
}

export const partitionScenarioFunctionsMeta = (
  functionsMeta: FunctionsMeta
): { app: FunctionsMeta; scenario: FunctionsMeta } => {
  const app: FunctionsMeta = {}
  const scenario: FunctionsMeta = {}
  for (const [name, meta] of Object.entries(functionsMeta)) {
    if (isScenarioFunction(meta)) {
      scenario[name] = meta
    } else {
      app[name] = meta
    }
  }
  return { app, scenario }
}

export const isScenarioWorkflow = (
  graphMeta: SerializedWorkflowGraphs,
  name: string
): boolean => (graphMeta as Record<string, any>)[name]?.source === 'scenario'

export const partitionScenarioWorkflows = (
  workflowNames: string[],
  workflowFiles: WiringFileMap,
  graphMeta: SerializedWorkflowGraphs
): {
  appNames: string[]
  scenarioNames: string[]
  appFiles: WiringFileMap
  scenarioFiles: WiringFileMap
} => {
  const appNames: string[] = []
  const scenarioNames: string[] = []
  for (const name of workflowNames) {
    if (isScenarioWorkflow(graphMeta, name)) {
      scenarioNames.push(name)
    } else {
      appNames.push(name)
    }
  }

  const appFiles: WiringFileMap = new Map()
  const scenarioFiles: WiringFileMap = new Map()
  for (const [name, entry] of workflowFiles) {
    if (isScenarioWorkflow(graphMeta, name)) {
      scenarioFiles.set(name, entry)
    } else {
      appFiles.set(name, entry)
    }
  }

  return { appNames, scenarioNames, appFiles, scenarioFiles }
}

/**
 * Drop every scenario and step from a function meta map. The deploy analyzer
 * reads inspector state rather than the partitioned codegen output, so it needs
 * the same split applied before it decides what a deployment contains.
 */
export const withoutScenarios = (functionsMeta: FunctionsMeta): FunctionsMeta =>
  Object.fromEntries(
    Object.entries(functionsMeta).filter(
      ([, meta]) => !isScenarioFunction(meta)
    )
  )

export const withoutScenarioWorkflows = (
  graphMeta: SerializedWorkflowGraphs
): SerializedWorkflowGraphs =>
  Object.fromEntries(
    Object.entries(graphMeta ?? {}).filter(
      ([name]) => !isScenarioWorkflow(graphMeta, name)
    )
  ) as SerializedWorkflowGraphs
