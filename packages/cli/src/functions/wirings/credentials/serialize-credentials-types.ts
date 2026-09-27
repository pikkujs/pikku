import type {
  CredentialDefinitions,
  CredentialDefinitionsMeta,
} from '@pikku/core/credential'
import { validateAndBuildCredentialDefinitionsMeta } from '@pikku/core/credential'
import type { SchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { tsLiteral } from '../../../utils/ts-literal.js'

export interface SerializeCredentialsOptions {
  definitions: CredentialDefinitions
  /** The already-resolved meta, so a mode a `wireAddon` overrode is the one that reaches the generated file. */
  credentials?: CredentialDefinitionsMeta
  schemaLookup: Map<string, SchemaRef>
  credentialsFile: string
  packageMappings: Record<string, string>
  /** Registers the meta into the app's pikku state so `wire.getCredential` can resolve a credential the project itself declares. Addons register theirs from their package file instead. */
  registerAppMeta?: boolean
}

export const serializeCredentialsTypes = ({
  definitions,
  credentials: resolvedCredentials,
  schemaLookup,
  credentialsFile,
  packageMappings,
  registerAppMeta,
}: SerializeCredentialsOptions) => {
  const credentials =
    resolvedCredentials ??
    validateAndBuildCredentialDefinitionsMeta(definitions, schemaLookup)
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
      `displayName: ${tsLiteral(meta.displayName)}`,
      `type: '${meta.type}'`,
    ]
    if (meta.oauth2) {
      metaParts.push(`oauth2: true`)
      // `type` rides along so consumers can tell a platform-wide credential from
      // a per-user one without a second lookup — they own different accounts.
      const config = JSON.stringify(
        { ...meta.oauth2, type: meta.type },
        null,
        2
      ).replace(/\n/g, '\n  ')
      oauth2Entries.push(`  '${name}': ${config}`)
    }
    metaEntries.push(`  '${name}': { ${metaParts.join(', ')} }`)
  }

  const imports: string[] = []

  imports.push(
    `import { TypedCredentialService as CoreTypedCredentialService } from '@pikku/core/services'
import type { CredentialMetaInfo } from '@pikku/core/services'`
  )
  imports.push(`import type { CredentialService } from '@pikku/core/services'`)

  if (registerAppMeta) {
    imports.push(`import { pikkuState } from '@pikku/core/state'`)
  }

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
} satisfies Record<
  string,
  OAuth2CredentialConfig & {
    appCredentialSecretId: string
    type: 'singleton' | 'wire'
  }
>
`
      : ''

  return `${imports.join('\n')}

export type CredentialsMap = {
${mapEntries.join('\n')}
}

const CREDENTIALS_META: Record<string, CredentialMetaInfo> = {
${metaEntries.join(',\n')}
}
${
  registerAppMeta
    ? `\npikkuState(null, 'package', 'credentialsMeta', CREDENTIALS_META)\n`
    : ''
}${oauth2Configs}

export class TypedCredentialService extends CoreTypedCredentialService<CredentialsMap> {
  constructor(credentials: CredentialService) {
    super(credentials, CREDENTIALS_META)
  }
}
`
}
