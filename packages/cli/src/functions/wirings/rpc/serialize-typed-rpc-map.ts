import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap, ExternalPackageConfig } from '@pikku/inspector'
import { FunctionsMeta, Logger } from '@pikku/core'
import { generateCustomTypes } from '../../../utils/custom-types-generator.js'
import { resolveFunctionIOTypes } from '../../../utils/resolve-function-types.js'

export const serializeTypedRPCMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  rpcMeta: Record<string, string>,
  externalPackages?: Record<string, ExternalPackageConfig>,
  workflowMapPath?: string
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedRPCs = generateRPCs(
    rpcMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

  const mcpTypes = [
    'MCPResourceResponse',
    'MCPToolResponse',
    'MCPPromptResponse',
  ]
  const usedMcpTypes = mcpTypes.filter((t) => requiredTypes.has(t))
  const mcpImport =
    usedMcpTypes.length > 0
      ? `import type { ${usedMcpTypes.join(', ')} } from '@pikku/core/mcp'`
      : ''
  for (const t of usedMcpTypes) {
    requiredTypes.delete(t)
  }

  const serializedImportMap = serializeImportMap(
    logger,
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )

  const externalPackageImports = generateExternalPackageImports(
    externalPackages,
    relativeToPath
  )

  const mergedRPCMap = generateMergedRPCMap(externalPackages)

  return `/**
 * This provides the structure needed for typescript to be aware of RPCs and their return types
 */

${mcpImport}
${serializedImportMap}
${serializedCustomTypes}

interface RPCHandler<I, O> {
    input: I;
    output: O;
}

${serializedRPCs}
${externalPackageImports}
${mergedRPCMap}

export type RPCInvoke = <Name extends keyof FlattenedRPCMap>(
  name: Name,
  data: FlattenedRPCMap[Name]['input']
) => Promise<FlattenedRPCMap[Name]['output']>

export type RPCRemote = <Name extends keyof FlattenedRPCMap>(
  name: Name,
  data: FlattenedRPCMap[Name]['input']
) => Promise<FlattenedRPCMap[Name]['output']>

// Import WorkflowMap for workflow typing
import type { WorkflowMap } from '${workflowMapPath}'

import type { PikkuRPC } from '@pikku/core/rpc'

type TypedStartWorkflow = <Name extends keyof WorkflowMap>(
  name: Name,
  input: WorkflowMap[Name]['input'],
  options?: { startNode?: string }
) => Promise<{ runId: string }>

export type TypedPikkuRPC = PikkuRPC<RPCInvoke, RPCRemote, TypedStartWorkflow>
  `
}

function generateExternalPackageImports(
  externalPackages: Record<string, ExternalPackageConfig> | undefined,
  relativeToPath: string
): string {
  if (!externalPackages || Object.keys(externalPackages).length === 0) {
    return ''
  }

  let imports = '\n// External package RPC maps\n'
  for (const [namespace, config] of Object.entries(externalPackages)) {
    // Import the RPCMap from each external package's internal RPC map
    // Use .js extension - package.json exports will resolve to .d.ts for types
    imports += `import type { RPCMap as ${toPascalCase(namespace)}RPCMap } from '${config.package}/.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js'\n`
  }
  return imports
}

function generateMergedRPCMap(
  externalPackages: Record<string, ExternalPackageConfig> | undefined
): string {
  if (!externalPackages || Object.keys(externalPackages).length === 0) {
    return `
// No external packages, use RPCMap directly
export type FlattenedRPCMap = RPCMap
`
  }

  // TypeScript utility to flatten namespaced RPC maps
  const utilityTypes = `
// Utility type to prefix keys with namespace
type PrefixKeys<T, Prefix extends string> = {
  [K in keyof T as \`\${Prefix}:\${string & K}\`]: T[K]
}

// Merge all RPC maps with namespace prefixes
export type FlattenedRPCMap =
  RPCMap${Object.keys(externalPackages)
    .map(
      (namespace) =>
        ` & PrefixKeys<${toPascalCase(namespace)}RPCMap, '${namespace}'>`
    )
    .join('')}
`

  return utilityTypes
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function generateRPCs(
  rpcMeta: Record<string, string>,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  const rpcsObj: Record<string, { inputType: string; outputType: string }> = {}

  for (const [funcName, pikkuFuncId] of Object.entries(rpcMeta)) {
    rpcsObj[funcName] = resolveFunctionIOTypes(
      pikkuFuncId,
      functionsMeta,
      typesMap,
      requiredTypes
    )
  }

  // Build the RPCs object as a string
  let rpcsStr = 'export type RPCMap = {\n'

  for (const [funcName, handler] of Object.entries(rpcsObj)) {
    rpcsStr += `  readonly '${funcName}': RPCHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }

  rpcsStr += '};\n'

  return rpcsStr
}
