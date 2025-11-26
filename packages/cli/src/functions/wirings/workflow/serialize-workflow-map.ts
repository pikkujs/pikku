import type { WorkflowsMeta } from '@pikku/core/workflow'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap, ZodSchemaRef } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'
import {
  generateCustomTypes,
  generateZodTypes,
} from '../../../utils/custom-types-generator.js'

export const serializeWorkflowMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  workflowsMeta: WorkflowsMeta,
  zodSchemas?: Map<string, ZodSchemaRef>
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedWorkflows = generateWorkflows(
    workflowsMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  const zodSchemaNames = zodSchemas ? new Set(zodSchemas.keys()) : undefined

  const serializedImportMap = serializeImportMap(
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes,
    zodSchemaNames
  )

  const zodTypes = zodSchemas
    ? generateZodTypes(relativeToPath, packageMappings, zodSchemas)
    : { imports: '', types: '' }

  return `/**
 * This provides the structure needed for TypeScript to be aware of workflows and their input/output types
 */

${serializedImportMap}
${zodTypes.imports}
${serializedCustomTypes}
${zodTypes.types}

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
  getRun: <output extends keyof WorkflowMap[Name]>(runId: string) => Promise<WorkflowMap[Name][output]>;

  /**
   * Cancel a running workflow
   */
  cancelRun: (runId: string) => Promise<boolean>;
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
    // For zod-derived schemas, the type might not be in typesMap, so use the schema name directly
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
