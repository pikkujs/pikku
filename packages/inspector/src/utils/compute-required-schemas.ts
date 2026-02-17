import type { FunctionsMeta } from '@pikku/core'
import type { TypesMap } from '../types-map.js'
import type { SchemaRef } from '../types.js'

const PRIMITIVE_TYPES = new Set([
  'boolean',
  'string',
  'number',
  'null',
  'undefined',
  'void',
  'any',
  'unknown',
  'never',
])

export function computeRequiredSchemas(
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  additionalTypes?: string[],
  schemaLookup?: Map<string, SchemaRef>
): Set<string> {
  return new Set<string>([
    ...Object.values(functionsMeta)
      .map(({ inputs, outputs }) => {
        const types: (string | undefined)[] = []
        if (inputs?.[0]) {
          try {
            types.push(typesMap.getUniqueName(inputs[0]))
          } catch {
            types.push(inputs[0])
          }
        }
        if (outputs?.[0]) {
          try {
            types.push(typesMap.getUniqueName(outputs[0]))
          } catch {
            types.push(outputs[0])
          }
        }
        return types
      })
      .flat()
      .filter((s): s is string => !!s && !PRIMITIVE_TYPES.has(s)),
    ...typesMap.customTypes.keys(),
    ...(additionalTypes || []),
    ...(schemaLookup ? Array.from(schemaLookup.keys()) : []),
  ])
}
