import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCredentialsTypes } from './serialize-credentials-types.js'
import { validateAndBuildCredentialDefinitionsMeta } from '@pikku/core/credential'
import type { CredentialDefinitionsMeta } from '@pikku/core/credential'
import type { CredentialOverrideMeta } from '@pikku/inspector'

/**
 * A credential's mode is the addon author's default until a `wireAddon`
 * overrides it, and the console reads the mode from this file rather than from
 * runtime state — so the override has to be resolved here, at generation time,
 * or the connect flow stays hidden for a credential the deployment made
 * per-user.
 */
const applyWiredCredentialModes = (
  meta: CredentialDefinitionsMeta,
  wireAddonDeclarations:
    | Map<
        string,
        { credentialOverrides?: Record<string, CredentialOverrideMeta> }
      >
    | undefined
) => {
  for (const declaration of wireAddonDeclarations?.values() ?? []) {
    for (const [logicalName, override] of Object.entries(
      declaration.credentialOverrides ?? {}
    )) {
      if (typeof override === 'string') continue
      const target = meta[override.name ?? logicalName]
      if (!target) continue
      if (override.secret) {
        target.type = 'singleton'
        target.secret = override.secret
      } else if (override.mode) {
        target.type = override.mode
      }
    }
  }
}

export const pikkuCredentials = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { credentialsFile, credentialsMetaJsonFile, packageMappings } = config

    if (!credentialsFile) {
      return
    }

    const state = await getInspectorState()

    if (!state.credentials || state.credentials.definitions.length === 0) {
      return
    }

    const meta = validateAndBuildCredentialDefinitionsMeta(
      state.credentials.definitions,
      state.schemaLookup
    )
    applyWiredCredentialModes(meta, state.rpc?.wireAddonDeclarations)

    const content = serializeCredentialsTypes({
      definitions: state.credentials.definitions,
      credentials: meta,
      schemaLookup: state.schemaLookup,
      credentialsFile,
      packageMappings,
      registerAppMeta: !config.addon,
    })
    await writeFileInDir(logger, credentialsFile, content)

    if (credentialsMetaJsonFile) {
      await writeFileInDir(
        logger,
        credentialsMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuCredentials types',
      commandEnd: 'Created PikkuCredentials types',
    }),
  ],
})
