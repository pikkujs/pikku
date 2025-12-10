import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap } from '@pikku/inspector'
import { FunctionsMeta, Logger } from '@pikku/core'
import { generateCustomTypes } from '../../../utils/custom-types-generator.js'

export const serializeTypedRPCMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  rpcMeta: Record<string, string>,
  externalPackages?: Record<string, string>
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedRPCs = generateRPCs(
    rpcMeta,
    functionsMeta,
    typesMap,
    requiredTypes
  )

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
  data: FlattenedRPCMap[Name]['input'],
  options?: {
    location?: 'local' | 'remote' | 'auto'
  }
) => Promise<FlattenedRPCMap[Name]['output']>

// Import WorkflowMap for workflow typing
import type { WorkflowMap } from '../workflow/pikku-workflow-map.gen.js'

export type TypedPikkuRPC = {
  depth: number;
  global: boolean;
  invoke: RPCInvoke;
  invokeExposed: (name: string, data: any) => Promise<any>;
  startWorkflow: <Name extends keyof WorkflowMap>(
    name: Name,
    input: WorkflowMap[Name]['input']
  ) => Promise<{ runId: string }>;
}
  `
}

function generateExternalPackageImports(
  externalPackages: Record<string, string> | undefined,
  relativeToPath: string
): string {
  if (!externalPackages || Object.keys(externalPackages).length === 0) {
    return ''
  }

  let imports = '\n// External package RPC maps\n'
  for (const [namespace, packageName] of Object.entries(externalPackages)) {
    // Import the RPCMap from each external package's internal RPC map
    // Use .js extension - package.json exports will resolve to .d.ts for types
    imports += `import type { RPCMap as ${toPascalCase(namespace)}RPCMap } from '${packageName}/.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js'\n`
  }
  return imports
}

function generateMergedRPCMap(
  externalPackages: Record<string, string> | undefined
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
  // Initialize an object to collect RPCs
  const rpcsObj: Record<string, { inputType: string; outputType: string }> = {}

  // Iterate through RPC metadata
  for (const [funcName, pikkuFuncName] of Object.entries(rpcMeta)) {
    const functionMeta = functionsMeta[pikkuFuncName]
    if (!functionMeta) {
      throw new Error(
        `Function ${funcName} not found in functionsMeta. Please check your configuration.`
      )
    }

    const input = functionMeta.inputs ? functionMeta.inputs[0] : undefined
    const output = functionMeta.outputs ? functionMeta.outputs[0] : undefined

    // Store the input and output types for RPCHandler
    // For zod-derived schemas, the type might not be in typesMap, so use the schema name directly
    let inputType = 'null'
    if (input) {
      try {
        inputType = typesMap.getTypeMeta(input).uniqueName
      } catch {
        // Type not in typesMap - use the name directly (e.g., zod-derived types)
        inputType = input
      }
    }

    let outputType = 'null'
    if (output) {
      try {
        outputType = typesMap.getTypeMeta(output).uniqueName
      } catch {
        // Type not in typesMap - use the name directly (e.g., zod-derived types)
        outputType = output
      }
    }

    requiredTypes.add(inputType)
    requiredTypes.add(outputType)

    // Add RPC entry
    rpcsObj[funcName] = {
      inputType,
      outputType,
    }
  }

  // Build the RPCs object as a string
  let rpcsStr = 'export type RPCMap = {\n'

  for (const [funcName, handler] of Object.entries(rpcsObj)) {
    rpcsStr += `  readonly '${funcName}': RPCHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }

  rpcsStr += '};\n'

  return rpcsStr
}
