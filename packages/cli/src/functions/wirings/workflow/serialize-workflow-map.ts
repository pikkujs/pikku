/**
 * Generate workflow map type definitions for type-safe client API
 */
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'
import { generateCustomTypes } from '../../../utils/custom-types-generator.js'

export const serializeWorkflowMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  workflowsMeta: WorkflowsMeta
) => {
  const requiredTypes = new Set<string>()

  // First generate workflows to collect required types
  const serializedWorkflows = generateWorkflows(
    workflowsMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  // Only generate custom types if we have workflows with types
  const hasWorkflows = Object.keys(workflowsMeta).length > 0
  const serializedCustomTypes = hasWorkflows
    ? generateCustomTypes(typesMap, requiredTypes)
    : ''

  const serializedImportMap = hasWorkflows
    ? serializeImportMap(
        relativeToPath,
        packageMappings,
        typesMap,
        requiredTypes
      )
    : ''

  return `/**
 * Workflow type map with input/output types for each workflow
 */

${serializedImportMap}
${serializedCustomTypes}

interface WorkflowHandler<I, O> {
    input: I;
    output: O;
}

${serializedWorkflows}

export type WorkflowClient<Name extends keyof WorkflowMap> = {
  start: (input: WorkflowMap[Name]['input']) => Promise<{ runId: string }>;
  getRun: <output extends keyof WorkflowMap[Name]>(runId: string) => Promise<WorkflowMap[Name][output]>;
  cancelRun: (runId: string) => Promise<boolean>;
}

export type TypedWorkflowClients = {
  [Name in keyof WorkflowMap]: WorkflowClient<Name>;
}
`
}

function generateWorkflows(
  workflowsMeta: WorkflowsMeta,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  const workflowsObj: Record<
    string,
    { inputType: string; outputType: string }
  > = {}

  for (const [workflowName, { pikkuFuncName }] of Object.entries(
    workflowsMeta
  )) {
    const functionMeta = functionsMeta[pikkuFuncName]
    if (!functionMeta) {
      throw new Error(
        `Function ${workflowName} not found in functionsMeta. Please check your configuration.`
      )
    }

    const input = functionMeta.inputs ? functionMeta.inputs[0] : undefined
    const output = functionMeta.outputs ? functionMeta.outputs[0] : undefined

    let inputType = 'void'
    if (input) {
      try {
        inputType = typesMap.getTypeMeta(input).uniqueName
      } catch {
        inputType = input
      }
    }
    let outputType = 'void'
    if (output) {
      try {
        outputType = typesMap.getTypeMeta(output).uniqueName
      } catch {
        outputType = output
      }
    }

    requiredTypes.add(inputType)
    requiredTypes.add(outputType)
    workflowsObj[workflowName] = { inputType, outputType }
  }

  let workflowsStr = 'export type WorkflowMap = {\n'
  for (const [workflowName, handler] of Object.entries(workflowsObj)) {
    workflowsStr += `  readonly '${workflowName}': WorkflowHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }
  workflowsStr += '};\n'

  return workflowsStr
}
