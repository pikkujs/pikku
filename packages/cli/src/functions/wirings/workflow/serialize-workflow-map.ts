/**
 * Generate workflow map type definitions for type-safe client API
 */
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { type TypesMap, generateCustomTypes } from '@pikku/inspector'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'
import { FunctionsMeta, parseVersionedId } from '@pikku/core'
import { Logger } from '@pikku/core/services'

export const serializeWorkflowMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  workflowsMeta: WorkflowsMeta,
  graphMeta: SerializedWorkflowGraphs
) => {
  const requiredTypes = new Set<string>()

  const serializedWorkflows = generateWorkflows(
    workflowsMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  const serializedGraphs = generateGraphs(
    graphMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  const hasAny =
    Object.keys(workflowsMeta).length > 0 || Object.keys(graphMeta).length > 0
  const serializedCustomTypes = hasAny
    ? generateCustomTypes(typesMap, requiredTypes)
    : ''

  const serializedImportMap = hasAny
    ? serializeImportMap(
        logger,
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

interface GraphNodeHandler<I> {
    input: I;
}

${serializedWorkflows}

${serializedGraphs}

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

  for (const [workflowName, { pikkuFuncId }] of Object.entries(workflowsMeta)) {
    const functionMeta = functionsMeta[pikkuFuncId]
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
  workflowsStr += '};'

  return workflowsStr
}

function generateGraphs(
  graphMeta: SerializedWorkflowGraphs,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  const graphsObj: Record<string, Record<string, { inputType: string }>> = {}

  for (const [graphName, graph] of Object.entries(graphMeta)) {
    graphsObj[graphName] = {}
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (!('rpcName' in node) || typeof node.rpcName !== 'string') {
        continue
      }
      let functionMeta = functionsMeta[node.rpcName as string]
      if (!functionMeta) {
        const { baseName } = parseVersionedId(node.rpcName as string)
        functionMeta = functionsMeta[baseName]
      }
      if (!functionMeta) {
        continue
      }
      const input = functionMeta.inputs ? functionMeta.inputs[0] : undefined
      let inputType = 'void'
      if (input) {
        try {
          inputType = typesMap.getTypeMeta(input).uniqueName
        } catch {
          inputType = input
        }
      }
      requiredTypes.add(inputType)
      graphsObj[graphName][nodeId] = { inputType }
    }
  }

  let graphsStr = 'export type GraphsMap = {\n'
  for (const [graphName, nodes] of Object.entries(graphsObj)) {
    graphsStr += `  readonly '${graphName}': {\n`
    for (const [nodeId, handler] of Object.entries(nodes)) {
      graphsStr += `    readonly '${nodeId}': GraphNodeHandler<${handler.inputType}>,\n`
    }
    graphsStr += '  },\n'
  }
  graphsStr += '};'

  return graphsStr
}
