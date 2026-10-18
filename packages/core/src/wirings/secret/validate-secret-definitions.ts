import type {
  SecretDefinitions,
  SecretDefinitionsMeta,
} from './secret.types.js'
import type { SchemaRefLike } from '../../types/core.types.js'

export type { SchemaRefLike }

/**
 * Merges the secret declarations the inspector found into meta keyed by name.
 * Declarations that share a `secretId` must agree on schema and OAuth 2 config.
 *
 * @throws Error when two declarations of one `secretId` disagree, or when a
 * generated secret has no `rotationPeriod`.
 * @internal Called by the CLI when generating meta.
 */
export function validateAndBuildSecretDefinitionsMeta(
  definitions: SecretDefinitions,
  schemaLookup: Map<string, SchemaRefLike>
): SecretDefinitionsMeta {
  const meta: SecretDefinitionsMeta = {}
  const secretIdToDefinition: Map<string, SecretDefinitions[0]> = new Map()

  for (const def of definitions) {
    if (def.generate && !def.rotationPeriod) {
      throw new Error(
        `Secret '${def.secretId}' is generated but has no 'rotationPeriod'.\n` +
          `  Declared in: ${def.sourceFile}\n` +
          `Add a rotationPeriod such as '30day', or 'never' to generate it once.`
      )
    }

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
          optional: def.optional,
          oauth2: def.oauth2,
          rotationPeriod: def.rotationPeriod,
          generate: def.generate,
          allowedHosts: def.allowedHosts,
          docsUrl: def.docsUrl,
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
        optional: def.optional,
        oauth2: def.oauth2,
        rotationPeriod: def.rotationPeriod,
        generate: def.generate,
        allowedHosts: def.allowedHosts,
        docsUrl: def.docsUrl,
        sourceFile: def.sourceFile,
      }
    }
  }

  return meta
}
