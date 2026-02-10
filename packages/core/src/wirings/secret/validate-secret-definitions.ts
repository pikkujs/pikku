import type {
  SecretDefinitions,
  SecretDefinitionsMeta,
} from './secret.types.js'

export interface SchemaRefLike {
  variableName: string
  sourceFile: string
}

export function validateAndBuildSecretDefinitionsMeta(
  definitions: SecretDefinitions,
  schemaLookup: Map<string, SchemaRefLike>
): SecretDefinitionsMeta {
  const meta: SecretDefinitionsMeta = {}
  const secretIdToDefinition: Map<string, SecretDefinitions[0]> = new Map()

  for (const def of definitions) {
    const existingDef = secretIdToDefinition.get(def.secretId)

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
              `Secret '${def.secretId}' is defined with different schemas.\n` +
                `  First definition: ${existingDef.sourceFile} (schema: ${existingSchemaRef.variableName})\n` +
                `  Second definition: ${def.sourceFile} (schema: ${defSchemaRef.variableName})\n` +
                `Credentials sharing a secretId must use the same schema.`
            )
          }
        }
      }

      if (def.oauth2 && existingDef.oauth2) {
        if (JSON.stringify(def.oauth2) !== JSON.stringify(existingDef.oauth2)) {
          throw new Error(
            `OAuth2 secret '${def.secretId}' is defined with different configurations.\n` +
              `  First definition: ${existingDef.sourceFile}\n` +
              `  Second definition: ${def.sourceFile}\n` +
              `Credentials sharing a secretId must use the same configuration.`
          )
        }
      }

      if (!meta[def.name]) {
        meta[def.name] = {
          name: def.name,
          displayName: def.displayName,
          description: def.description,
          secretId: def.secretId,
          schema: def.schema,
          oauth2: def.oauth2,
          sourceFile: def.sourceFile,
        }
      }
      continue
    }

    secretIdToDefinition.set(def.secretId, def)

    if (!meta[def.name]) {
      meta[def.name] = {
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        secretId: def.secretId,
        schema: def.schema,
        oauth2: def.oauth2,
        sourceFile: def.sourceFile,
      }
    }
  }

  return meta
}
