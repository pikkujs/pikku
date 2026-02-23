import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import {
  TypesMap,
  ExternalPackageConfig,
  generateCustomTypes,
} from '@pikku/inspector'
import { Logger } from '@pikku/core/services'

export const serializeTypedRPCMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  rpcMeta: Record<string, string>,
  resolvedIOTypes: Record<string, { inputType: string; outputType: string }>,
  externalPackages?: Record<string, ExternalPackageConfig>,
  workflowMapPath?: string,
  agentMapPath?: string
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedRPCs = generateRPCs(rpcMeta, resolvedIOTypes, requiredTypes)

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

  const serializedCustomTypesDeclarationsOnly = serializedCustomTypes
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n')

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
${serializedCustomTypesDeclarationsOnly}

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

${workflowMapPath ? `import type { WorkflowMap } from '${workflowMapPath}'` : `type WorkflowMap = {}`}

${agentMapPath ? `import type { AgentMap } from '${agentMapPath}'` : `type AgentMap = {}`}
${generateExternalAgentImports(externalPackages)}
${generateMergedAgentMap(externalPackages)}

import type { PikkuRPC } from '@pikku/core/rpc'

interface AIAgentInput {
  message: string
  threadId: string
  resourceId: string
}

type TypedStartWorkflow = <Name extends keyof WorkflowMap>(
  name: Name,
  input: WorkflowMap[Name]['input'],
  options?: { startNode?: string }
) => Promise<{ runId: string }>

type TypedAgent = <Name extends keyof FlattenedAgentMap>(
  name: Name,
  input: AIAgentInput
) => Promise<{ runId: string; result: FlattenedAgentMap[Name]['output']; usage: { inputTokens: number; outputTokens: number } }>

export type TypedPikkuRPC = PikkuRPC<RPCInvoke, RPCRemote, TypedStartWorkflow, TypedAgent>
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

function generateExternalAgentImports(
  externalPackages: Record<string, ExternalPackageConfig> | undefined
): string {
  if (!externalPackages || Object.keys(externalPackages).length === 0) {
    return ''
  }

  let imports = '\n// External package Agent maps\n'
  for (const [namespace, config] of Object.entries(externalPackages)) {
    imports += `import type { AgentMap as ${toPascalCase(namespace)}AgentMap } from '${config.package}/.pikku/agent/pikku-agent-map.gen.d.js'\n`
  }
  return imports
}

function generateMergedAgentMap(
  externalPackages: Record<string, ExternalPackageConfig> | undefined
): string {
  if (!externalPackages || Object.keys(externalPackages).length === 0) {
    return `
type FlattenedAgentMap = AgentMap
`
  }

  return `
type FlattenedAgentMap =
  AgentMap${Object.keys(externalPackages)
    .map(
      (namespace) =>
        ` & PrefixKeys<${toPascalCase(namespace)}AgentMap, '${namespace}'>`
    )
    .join('')}
`
}

function generateRPCs(
  rpcMeta: Record<string, string>,
  resolvedIOTypes: Record<string, { inputType: string; outputType: string }>,
  requiredTypes: Set<string>
) {
  const rpcsObj: Record<string, { inputType: string; outputType: string }> = {}

  for (const [funcName, pikkuFuncId] of Object.entries(rpcMeta)) {
    const resolved = resolvedIOTypes[pikkuFuncId]
    if (!resolved) {
      throw new Error(
        `Function ${pikkuFuncId} not found in resolvedIOTypes. Please check your configuration.`
      )
    }
    requiredTypes.add(resolved.inputType)
    requiredTypes.add(resolved.outputType)
    rpcsObj[funcName] = resolved
  }

  // Build the RPCs object as a string
  let rpcsStr = 'export type RPCMap = {\n'

  for (const [funcName, handler] of Object.entries(rpcsObj)) {
    rpcsStr += `  readonly '${funcName}': RPCHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }

  rpcsStr += '};\n'

  return rpcsStr
}
