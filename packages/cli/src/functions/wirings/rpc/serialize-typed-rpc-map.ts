import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'
import { generateCustomTypes } from '../../../utils/custom-types-generator.js'

export const serializeTypedRPCMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  rpcMeta: Record<string, string>
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
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )

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

export type RPCInvoke = <Name extends keyof RPCMap>(
  name: Name,
  data: RPCMap[Name]['input'],
  options?: {
    location?: 'local' | 'remote' | 'auto'
  }
) => Promise<RPCMap[Name]['output']>

export type TypedPikkuRPC = {
  depth: number;
  global: boolean;
  invoke: RPCInvoke;
  invokeExposed: (name: string, data: any) => Promise<any> 
}
  `
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
    const inputType = input ? typesMap.getTypeMeta(input).uniqueName : 'null'
    const outputType = output ? typesMap.getTypeMeta(output).uniqueName : 'null'

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
