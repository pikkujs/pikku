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
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedWorkflows = generateWorkflows(
    workflowsMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  const serializedImportMap = serializeImportMap(
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )

  return `/**
 * This provides the structure needed for TypeScript to be aware of workflows and their input/output types
 */

${serializedImportMap}
${serializedCustomTypes}

import type { WorkflowRun } from '@pikku/core/workflow'

interface WorkflowHandler<I, O> {
    input: I;
    output: O;
}

${serializedWorkflows}

/**
 * Type-safe workflow client API
 */
export type WorkflowClient<Name extends keyof WorkflowMap> = {
  /**
   * Start a new workflow run
   */
  start: (input: WorkflowMap[Name]['input']) => Promise<{ runId: string }>;

  /**
   * Get a workflow run by ID
   */
  getRun: (runId: string) => Promise<WorkflowRun>;

  /**
   * Cancel a running workflow
   */
  cancelRun: (runId: string) => Promise<void>;
}

/**
 * Map of all registered workflows with type-safe client APIs
 */
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
  // Initialize an object to collect workflows
  const workflowsObj: Record<
    string,
    { inputType: string; outputType: string }
  > = {}

  // Iterate through workflow metadata
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

    // Store the input and output types for WorkflowHandler
    const inputType = input ? typesMap.getTypeMeta(input).uniqueName : 'void'
    const outputType = output ? typesMap.getTypeMeta(output).uniqueName : 'void'

    requiredTypes.add(inputType)
    requiredTypes.add(outputType)

    // Add workflow entry
    workflowsObj[workflowName] = {
      inputType,
      outputType,
    }
  }

  // Build the Workflows object as a string
  let workflowsStr = 'export type WorkflowMap = {\n'

  for (const [workflowName, handler] of Object.entries(workflowsObj)) {
    workflowsStr += `  readonly '${workflowName}': WorkflowHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }

  workflowsStr += '};\n'

  return workflowsStr
}
