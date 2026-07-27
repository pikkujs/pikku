import type { FunctionsMeta } from '@pikku/core'
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

export const partitionScenarioFunctions = (
  files: WiringFileMap,
  functionsMeta: FunctionsMeta
): { app: WiringFileMap; scenario: WiringFileMap } => {
  const app: WiringFileMap = new Map()
  const scenario: WiringFileMap = new Map()
  for (const [name, entry] of files) {
    if (isScenarioStep(functionsMeta[name])) {
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
    if (isScenarioStep(meta)) {
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
