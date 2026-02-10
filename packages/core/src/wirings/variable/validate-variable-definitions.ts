import type {
  VariableDefinitions,
  VariableDefinitionsMeta,
} from './variable.types.js'

export interface SchemaRefLike {
  variableName: string
  sourceFile: string
}

export function validateAndBuildVariableDefinitionsMeta(
  definitions: VariableDefinitions,
  schemaLookup: Map<string, SchemaRefLike>
): VariableDefinitionsMeta {
  const meta: VariableDefinitionsMeta = {}
  const variableIdToDefinition: Map<string, VariableDefinitions[0]> = new Map()

  for (const def of definitions) {
    const existingDef = variableIdToDefinition.get(def.variableId)

    if (existingDef) {
      if (def.schema && existingDef.schema) {
        const defSchemaRef = schemaLookup.get(def.schema as string)
        const existingSchemaRef = schemaLookup.get(existingDef.schema as string)

        if (defSchemaRef && existingSchemaRef) {
          if (
            defSchemaRef.variableName !== existingSchemaRef.variableName ||
            defSchemaRef.sourceFile !== existingSchemaRef.sourceFile
          ) {
            throw new Error(
              `Variable '${def.variableId}' is defined with different schemas.\n` +
                `  First definition: ${existingDef.sourceFile} (schema: ${existingSchemaRef.variableName})\n` +
                `  Second definition: ${def.sourceFile} (schema: ${defSchemaRef.variableName})\n` +
                `Variables sharing a variableId must use the same schema.`
            )
          }
        }
      }

      if (!meta[def.name]) {
        meta[def.name] = {
          name: def.name,
          displayName: def.displayName,
          description: def.description,
          variableId: def.variableId,
          schema: def.schema,
          sourceFile: def.sourceFile,
        }
      }
      continue
    }

    variableIdToDefinition.set(def.variableId, def)

    if (!meta[def.name]) {
      meta[def.name] = {
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        variableId: def.variableId,
        schema: def.schema,
        sourceFile: def.sourceFile,
      }
    }
  }

  return meta
}
