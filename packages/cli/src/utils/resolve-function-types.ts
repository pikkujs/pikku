import { TypesMap } from '@pikku/inspector'
import { FunctionsMeta } from '@pikku/core'

export function resolveFunctionIOTypes(
  pikkuFuncId: string,
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
): { inputType: string; outputType: string } {
  const functionMeta = functionsMeta[pikkuFuncId]
  if (!functionMeta) {
    throw new Error(
      `Function ${pikkuFuncId} not found in functionsMeta. Please check your configuration.`
    )
  }

  const input = functionMeta.inputs ? functionMeta.inputs[0] : undefined
  const output = functionMeta.outputs ? functionMeta.outputs[0] : undefined

  let inputType = 'null'
  if (input) {
    try {
      inputType = typesMap.getTypeMeta(input).uniqueName
    } catch {
      inputType = input
    }
  }

  let outputType = 'null'
  if (output) {
    try {
      outputType = typesMap.getTypeMeta(output).uniqueName
    } catch {
      outputType = output
    }
  }

  requiredTypes.add(inputType)
  requiredTypes.add(outputType)

  return { inputType, outputType }
}
