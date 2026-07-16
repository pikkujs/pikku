import type { CredentialDefinitions } from '@pikku/core/credential'
import { validateAndBuildCredentialDefinitionsMeta } from '@pikku/core/credential'
import type { SchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface SerializeCredentialsOptions {
  definitions: CredentialDefinitions
  schemaLookup: Map<string, SchemaRef>
  credentialsFile: string
  packageMappings: Record<string, string>
}

export const serializeCredentialsTypes = ({
  definitions,
  schemaLookup,
  credentialsFile,
  packageMappings,
}: SerializeCredentialsOptions) => {
  const credentials = validateAndBuildCredentialDefinitionsMeta(
    definitions,
    schemaLookup
  )
  const credentialEntries = Object.entries(credentials)

  const schemaImports: Map<string, Set<string>> = new Map()
  let needsZod = false

  const mapEntries: string[] = []
  const metaEntries: string[] = []
  const oauth2Entries: string[] = []

  for (const [name, meta] of credentialEntries) {
    if (meta.schema && typeof meta.schema === 'string') {
      const schemaRef = schemaLookup.get(meta.schema)
      if (schemaRef) {
        needsZod = true
        if (!schemaImports.has(schemaRef.sourceFile)) {
          schemaImports.set(schemaRef.sourceFile, new Set())
        }
        schemaImports.get(schemaRef.sourceFile)!.add(schemaRef.variableName)

        mapEntries.push(
          `  '${name}': z.infer<typeof ${schemaRef.variableName}>`
        )
      }
    }

    const metaParts = [
      `name: '${name}'`,
      `displayName: '${meta.displayName}'`,
      `type: '${meta.type}'`,
    ]
    if (meta.oauth2) {
      metaParts.push(`oauth2: true`)
      // Emit the whole declared config, not just the flag: generated addon
      // services import this instead of hand-rolling a duplicate const that
      // silently drifts from wireCredential (#950).
      const config = JSON.stringify(meta.oauth2, null, 2).replace(/\n/g, '\n  ')
      oauth2Entries.push(`  '${name}': ${config}`)
    }
    metaEntries.push(`  '${name}': { ${metaParts.join(', ')} }`)
  }

  const imports: string[] = []

  imports.push(
    `import { TypedCredentialService as CoreTypedCredentialService, type CredentialMetaInfo } from '@pikku/core/services'`
  )
  imports.push(`import type { CredentialService } from '@pikku/core/services'`)

  if (oauth2Entries.length > 0) {
    imports.push(
      `import type { OAuth2CredentialConfig } from '@pikku/core/secret'`
    )
  }

  if (needsZod) {
    imports.push(`import type { z } from 'zod'`)
  }

  for (const [sourceFile, variableNames] of schemaImports) {
    const importPath = getFileImportRelativePath(
      credentialsFile,
      sourceFile,
      packageMappings
    )
    const vars = Array.from(variableNames).join(', ')
    imports.push(`import { ${vars} } from '${importPath}'`)
  }

  const oauth2Configs =
    oauth2Entries.length > 0
      ? `
export const CREDENTIAL_OAUTH2_CONFIGS = {
${oauth2Entries.join(',\n')}
} satisfies Record<string, OAuth2CredentialConfig & { appCredentialSecretId: string }>
`
      : ''

  return `${imports.join('\n')}

export interface CredentialsMap {
${mapEntries.join('\n')}
}

export type CredentialName = keyof CredentialsMap

const CREDENTIALS_META: Record<string, CredentialMetaInfo> = {
${metaEntries.join(',\n')}
}
${oauth2Configs}

export class TypedCredentialService extends CoreTypedCredentialService<CredentialsMap> {
  constructor(credentials: CredentialService) {
    super(credentials, CREDENTIALS_META)
  }
}
`
}
