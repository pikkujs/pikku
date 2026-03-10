import type {
  CredentialDefinitions,
  CredentialDefinitionsMeta,
} from './credential.types.js'

export interface SchemaRefLike {
  variableName: string
  sourceFile: string
}

export function validateAndBuildCredentialDefinitionsMeta(
  definitions: CredentialDefinitions,
  schemaLookup: Map<string, SchemaRefLike>
): CredentialDefinitionsMeta {
  const meta: CredentialDefinitionsMeta = {}

  for (const def of definitions) {
    const existing = meta[def.name]

    if (existing) {
      if (def.schema && existing.schema) {
        const defSchemaRef = schemaLookup.get(def.schema as string)
        const existingSchemaRef = schemaLookup.get(existing.schema as string)

        if (defSchemaRef && existingSchemaRef) {
          if (
            defSchemaRef.variableName !== existingSchemaRef.variableName ||
            defSchemaRef.sourceFile !== existingSchemaRef.sourceFile
          ) {
            throw new Error(
              `Credential '${def.name}' is defined with different schemas.\n` +
                `  First definition: ${existing.sourceFile} (schema: ${existingSchemaRef.variableName})\n` +
                `  Second definition: ${def.sourceFile} (schema: ${defSchemaRef.variableName})\n` +
                `Credentials sharing a name must use the same schema.`
            )
          }
        }
      }

      if (def.type !== existing.type) {
        throw new Error(
          `Credential '${def.name}' is defined with different types.\n` +
            `  First definition: ${existing.sourceFile} (type: ${existing.type})\n` +
            `  Second definition: ${def.sourceFile} (type: ${def.type})\n` +
            `Credentials sharing a name must use the same type.`
        )
      }

      continue
    }

    meta[def.name] = {
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      type: def.type,
      schema: def.schema,
      oauth2: def.oauth2,
      sourceFile: def.sourceFile,
    }
  }

  return meta
}
