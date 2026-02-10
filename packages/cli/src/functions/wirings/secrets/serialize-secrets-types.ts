import { SecretDefinitions } from '@pikku/core/secret'
import { validateAndBuildSecretDefinitionsMeta } from '@pikku/core/secret'
import { SchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface SerializeSecretsOptions {
  definitions: SecretDefinitions
  schemaLookup: Map<string, SchemaRef>
  secretsFile: string
  packageMappings: Record<string, string>
}

export const serializeSecretsTypes = ({
  definitions,
  schemaLookup,
  secretsFile,
  packageMappings,
}: SerializeSecretsOptions) => {
  const secrets = validateAndBuildSecretDefinitionsMeta(
    definitions,
    schemaLookup
  )
  const credentialEntries = Object.entries(secrets)

  const schemaImports: Map<string, Set<string>> = new Map()
  let needsOAuth2Types = false
  let needsZod = false

  const mapEntries: string[] = []
  const metaEntries: string[] = []

  for (const [name, meta] of credentialEntries) {
    if (meta.oauth2) {
      needsOAuth2Types = true
      mapEntries.push(`  '${meta.secretId}': OAuth2AppCredential`)
      mapEntries.push(`  '${meta.oauth2.tokenSecretId}': OAuth2Token`)

      metaEntries.push(
        `  '${meta.secretId}': { name: '${name}', displayName: '${meta.displayName}', oauth2: { tokenSecretId: '${meta.oauth2.tokenSecretId}' } }`
      )
      metaEntries.push(
        `  '${meta.oauth2.tokenSecretId}': { name: '${name}_tokens', displayName: '${meta.displayName} Tokens' }`
      )
    } else if (meta.schema && typeof meta.schema === 'string') {
      const schemaRef = schemaLookup.get(meta.schema)
      if (schemaRef) {
        needsZod = true
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

  const imports: string[] = []

  imports.push(
    `import { TypedSecretService as CoreTypedSecretService, type CredentialMeta } from '@pikku/core/services'`
  )
  imports.push(`import type { SecretService } from '@pikku/core/services'`)

  if (needsZod) {
    imports.push(`import type { z } from 'zod'`)
  }

  if (needsOAuth2Types) {
    imports.push(
      `import type { OAuth2AppCredential, OAuth2Token } from '@pikku/core/oauth2'`
    )
  }

  for (const [sourceFile, variableNames] of schemaImports) {
    const importPath = getFileImportRelativePath(
      secretsFile,
      sourceFile,
      packageMappings
    )
    const vars = Array.from(variableNames).join(', ')
    imports.push(`import { ${vars} } from '${importPath}'`)
  }

  return `${imports.join('\n')}

export interface CredentialsMap {
${mapEntries.join('\n')}
}

export type SecretId = keyof CredentialsMap

const CREDENTIALS_META: Record<string, CredentialMeta> = {
${metaEntries.join(',\n')}
}

export class TypedSecretService extends CoreTypedSecretService<CredentialsMap> {
  constructor(secrets: SecretService) {
    super(secrets, CREDENTIALS_META)
  }
}
`
}
