/**
 * Generate workflow map type definitions for type-safe client API
 */
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { type TypesMap, generateCustomTypes } from '@pikku/inspector'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'
import type { FunctionsMeta } from '@pikku/core'
import { parseVersionedId } from '@pikku/core'
import type { Logger } from '@pikku/core/services'

type WireAddonDeclarations = Map<
  string,
  { package: string; rpcEndpoint?: string }
>

export const serializeWorkflowMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  workflowsMeta: WorkflowsMeta,
  graphMeta: SerializedWorkflowGraphs,
  wireAddonDeclarations?: WireAddonDeclarations
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

  const serializedCustomTypesDeclarationsOnly = serializedCustomTypes
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n')

  const addonImports = generateAddonWorkflowImports(wireAddonDeclarations)
  const mergedWorkflowMap = generateMergedWorkflowMap(wireAddonDeclarations)

  return `/**
 * Workflow type map with input/output types for each workflow
 */

${serializedImportMap}
${serializedCustomTypesDeclarationsOnly}
${addonImports}

interface WorkflowHandler<I, O> {
    input: I;
    output: O;
}

interface GraphNodeHandler<I> {
    input: I;
}

${serializedWorkflows}

${serializedGraphs}
${mergedWorkflowMap}

export type WorkflowClient<Name extends keyof FlattenedWorkflowMap> = {
  start: (input: FlattenedWorkflowMap[Name]['input']) => Promise<{ runId: string }>;
  getRun: <output extends keyof FlattenedWorkflowMap[Name]>(runId: string) => Promise<FlattenedWorkflowMap[Name][output]>;
  cancelRun: (runId: string) => Promise<boolean>;
}

export type TypedWorkflowClients = {
  [Name in keyof FlattenedWorkflowMap]: WorkflowClient<Name>;
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

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function generateAddonWorkflowImports(
  wireAddonDeclarations: WireAddonDeclarations | undefined
): string {
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) {
    return ''
  }

  let imports = '\n// Addon package Workflow maps\n'
  for (const [namespace, decl] of wireAddonDeclarations.entries()) {
    imports += `import type { WorkflowMap as ${toPascalCase(namespace)}WorkflowMap } from '${decl.package}/.pikku/workflow/pikku-workflow-map.gen.d.js'\n`
  }
  return imports
}

function generateMergedWorkflowMap(
  wireAddonDeclarations: WireAddonDeclarations | undefined
): string {
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) {
    return `
export type FlattenedWorkflowMap = WorkflowMap
`
  }

  return `
type PrefixWorkflowKeys<T, Prefix extends string> = unknown extends T ? {} : {
  [K in keyof T as \`\${Prefix}:\${string & K}\`]: T[K]
}

export type FlattenedWorkflowMap =
  WorkflowMap${Array.from(wireAddonDeclarations.keys())
    .map(
      (namespace) =>
        ` & PrefixWorkflowKeys<${toPascalCase(namespace)}WorkflowMap, '${namespace}'>`
    )
    .join('')}
`
}
