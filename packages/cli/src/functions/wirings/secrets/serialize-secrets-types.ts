import { CredentialsMeta, CredentialDefinitions } from '@pikku/core/credential'
import { SchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface SerializeSecretsOptions {
  definitions: CredentialDefinitions
  schemaLookup: Map<string, SchemaRef>
  secretsFile: string
  packageMappings: Record<string, string>
}

/**
 * Validates credential definitions and builds the credentials meta.
 * Throws if the same secretId is used with different schemas.
 * Multiple credentials can share the same secretId if they have identical schemas.
 */
export function validateAndBuildCredentialsMeta(
  definitions: CredentialDefinitions,
  schemaLookup: Map<string, SchemaRef>
): CredentialsMeta {
  const meta: CredentialsMeta = {}
  // Track secretId -> first definition that used it (for error messages and comparison)
  const secretIdToDefinition: Map<string, CredentialDefinitions[0]> = new Map()

  for (const def of definitions) {
    const existingDef = secretIdToDefinition.get(def.secretId)

    if (existingDef) {
      // Same secretId - validate schemas are identical
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

      // Compare OAuth2 configs
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

      // Same schema/config - skip duplicate (already in meta by name or add by this name)
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

    // First time seeing this secretId
    secretIdToDefinition.set(def.secretId, def)

    // Add to meta (keyed by name)
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

/**
 * Generates the CredentialsMap type and TypedSecretService wrapper.
 * Maps each secretId to its corresponding TypeScript type.
 * Validates that duplicate credentials have identical schemas.
 */
export const serializeSecretsTypes = ({
  definitions,
  schemaLookup,
  secretsFile,
  packageMappings,
}: SerializeSecretsOptions) => {
  // Validate definitions and build meta (throws on conflicts)
  const credentials = validateAndBuildCredentialsMeta(definitions, schemaLookup)
  const credentialEntries = Object.entries(credentials)

  if (credentialEntries.length === 0) {
    return `/**
 * No credentials declared - TypedSecretService not generated.
 */
export {}
`
  }

  // Collect imports needed
  const schemaImports: Map<string, Set<string>> = new Map() // sourceFile -> variable names
  let needsOAuth2Types = false
  let needsZod = false

  // Build CredentialsMap entries
  const mapEntries: string[] = []
  const metaEntries: string[] = []

  for (const [name, meta] of credentialEntries) {
    // Check if this is an OAuth2 credential
    if (meta.oauth2) {
      needsOAuth2Types = true
      // OAuth2 credentials have two secret IDs:
      // - secretId: app credentials (OAuth2AppCredential)
      // - tokenSecretId: tokens (OAuth2Token)
      mapEntries.push(`  '${meta.secretId}': OAuth2AppCredential`)
      mapEntries.push(`  '${meta.oauth2.tokenSecretId}': OAuth2Token`)

      metaEntries.push(
        `  '${meta.secretId}': { name: '${name}', displayName: '${meta.displayName}', oauth2: { tokenSecretId: '${meta.oauth2.tokenSecretId}' } }`
      )
      metaEntries.push(
        `  '${meta.oauth2.tokenSecretId}': { name: '${name}_tokens', displayName: '${meta.displayName} Tokens' }`
      )
    } else if (meta.schema && typeof meta.schema === 'string') {
      // Regular credential with Zod schema
      const schemaRef = schemaLookup.get(meta.schema)
      if (schemaRef) {
        needsZod = true
        // Track import
        if (!schemaImports.has(schemaRef.sourceFile)) {
          schemaImports.set(schemaRef.sourceFile, new Set())
        }
        schemaImports.get(schemaRef.sourceFile)!.add(schemaRef.variableName)

        mapEntries.push(
          `  '${meta.secretId}': z.infer<typeof ${schemaRef.variableName}>`
        )
        metaEntries.push(
          `  '${meta.secretId}': { name: '${name}', displayName: '${meta.displayName}' }`
        )
      }
    }
  }

  // Generate imports
  const imports: string[] = []

  imports.push(`import type { SecretService } from '@pikku/core/services'`)

  if (needsZod) {
    imports.push(`import type { z } from 'zod'`)
  }

  if (needsOAuth2Types) {
    imports.push(
      `import type { OAuth2AppCredential, OAuth2Token } from '@pikku/core/oauth2'`
    )
  }

  // Add schema imports
  for (const [sourceFile, variableNames] of schemaImports) {
    const importPath = getFileImportRelativePath(
      secretsFile,
      sourceFile,
      packageMappings
    )
    const vars = Array.from(variableNames).join(', ')
    imports.push(`import { ${vars} } from '${importPath}'`)
  }

  return `/**
 * Typed secrets wrapper for credential access.
 * Generated from wireCredential and wireOAuth2Credential declarations.
 */

${imports.join('\n')}

/**
 * Map of secret IDs to their credential types.
 */
export interface CredentialsMap {
${mapEntries.join('\n')}
}

/**
 * Union of all declared secret IDs.
 */
export type SecretId = keyof CredentialsMap

/**
 * Credential status information
 */
export interface CredentialStatus {
  secretId: string
  name: string
  displayName: string
  isConfigured: boolean
  oauth2?: { tokenSecretId: string }
}

/**
 * Credentials metadata for runtime status checking
 */
const CREDENTIALS_META: Record<string, { name: string; displayName: string; oauth2?: { tokenSecretId: string } }> = {
${metaEntries.join(',\n')}
}

/**
 * Typed wrapper for SecretService that provides:
 * - Type-safe access to credentials by secretId
 * - Full SecretService interface compatibility
 * - Status checking without throwing errors
 * - Visibility into all declared credentials
 */
export class TypedSecretService implements SecretService {
  constructor(private secrets: SecretService) {}

  /**
   * Get a credential value with full type inference.
   * @param secretId - The secret ID (compile-time validated)
   * @returns The credential value with correct type
   * @throws If the secret is not found
   */
  async getSecretJSON<K extends SecretId>(key: K): Promise<CredentialsMap[K]>
  async getSecretJSON<T = unknown>(key: string): Promise<T>
  async getSecretJSON(key: string): Promise<unknown> {
    return this.secrets.getSecretJSON(key)
  }

  /**
   * Get a secret as a raw string.
   */
  async getSecret(key: string): Promise<string> {
    return this.secrets.getSecret(key)
  }

  /**
   * Check if a credential exists without throwing.
   * @param secretId - The secret ID to check
   * @returns true if the credential is configured
   */
  async hasSecret(key: string): Promise<boolean> {
    return this.secrets.hasSecret(key)
  }

  /**
   * Set a secret value as JSON with type enforcement.
   */
  async setSecretJSON<K extends string>(
    key: K,
    value: K extends SecretId ? CredentialsMap[K] : unknown
  ): Promise<void> {
    return this.secrets.setSecretJSON(key, value)
  }

  /**
   * Delete a secret.
   */
  async deleteSecret(key: string): Promise<void> {
    return this.secrets.deleteSecret(key)
  }

  /**
   * Get status of all declared credentials.
   * Useful for UI display and pre-validation.
   * @returns Array of credential statuses
   */
  async getAllStatus(): Promise<CredentialStatus[]> {
    const results: CredentialStatus[] = []

    for (const [secretId, meta] of Object.entries(CREDENTIALS_META)) {
      results.push({
        secretId,
        name: meta.name,
        displayName: meta.displayName,
        isConfigured: await this.secrets.hasSecret(secretId),
        oauth2: meta.oauth2,
      })
    }

    return results
  }

  /**
   * Get only the credentials that are missing/not configured.
   * @returns Array of missing credential statuses
   */
  async getMissing(): Promise<CredentialStatus[]> {
    const all = await this.getAllStatus()
    return all.filter((c) => !c.isConfigured)
  }
}
`
}
