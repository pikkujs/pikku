import type {
  VariableDefinitions,
  VariableDefinitionsMeta,
} from './variable.types.js'
import type { SchemaRefLike } from '../../types/core.types.js'

export type { SchemaRefLike }

/**
 * Merges the variable declarations the inspector found into meta keyed by name.
 * Declarations that share a `variableId` must use the same schema.
 *
 * @throws Error when two declarations of one `variableId` disagree on schema.
 * @internal Called by the CLI when generating meta.
 */
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
          optional: def.optional,
          docsUrl: def.docsUrl,
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
        optional: def.optional,
        docsUrl: def.docsUrl,
        sourceFile: def.sourceFile,
      }
    }
  }

  return meta
}
