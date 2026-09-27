import { pikkuSessionlessFunc } from '#pikku/function'
import type { InspectorState } from '@pikku/inspector'
import { rm } from 'fs/promises'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeAddonInstallTypes,
  serializeAddonTypes,
} from './serialize-addon-types.js'

type AddonTypesCommandInput = {
  bootstrap?: boolean
}

/**
 * The functions each installed addon publishes, by package — what `mcp` on a
 * `wireAddon` is typed against. A package wired twice contributes the same
 * names under both namespaces, and a remote addon contributes none: its
 * functions run on the host, and it is `wireRemoteAddon` that installs it.
 */
const addonFunctionNames = (
  state: InspectorState
): Record<string, string[]> => {
  const names: Record<string, string[]> = {}
  for (const [namespace, decl] of state.rpc.wireAddonDeclarations) {
    if (decl.remote) {
      continue
    }
    const meta = state.addonFunctions[namespace]
    if (meta) {
      names[decl.package] = Object.keys(meta)
    }
  }
  return names
}

export const pikkuAddonTypes = pikkuSessionlessFunc<
  AddonTypesCommandInput,
  void
>({
  func: async ({ logger, config, getInspectorState }, input) => {
    const {
      addonTypesFile,
      addonSetupTypesFile,
      packageMappings,
      servicesFile,
      secretsFile,
      credentialsFile,
      variablesFile,
    } = config

    // A project is one or the other, so the half it is not keeps no file on
    // disk. A tree generated before it changed kind still has that file, and
    // `existsSync` is what decides a leaf is alive — so left behind it would
    // keep the wrong `#pikku/addon` resolving forever.
    await rm(config.addon ? addonTypesFile : addonSetupTypesFile, {
      force: true,
    })

    const bootstrap = input?.bootstrap === true

    // An application installs addons; an addon package declares itself. The app
    // half is written on the bootstrap run too — `wireAddon` has to resolve
    // before the inspector can read the calls that say which addons are
    // installed — but only the full run knows what each addon publishes, so
    // that is when `mcp` gets its names.
    if (!config.addon) {
      await writeFileInDir(
        logger,
        addonTypesFile,
        serializeAddonInstallTypes(
          bootstrap ? {} : addonFunctionNames(await getInspectorState())
        )
      )
      return
    }

    if (bootstrap) {
      await writeFileInDir(logger, addonSetupTypesFile, 'export {}\n')
      return
    }

    const visitState = await getInspectorState()

    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      singletonServicesType: true,
    })

    const { singletonServicesType, pikkuConfigType } =
      visitState.filesAndMethods

    if (!singletonServicesType) {
      throw new Error('Required types not found')
    }

    const configTypeImport = pikkuConfigType
      ? `import type { ${pikkuConfigType.type} } from '${getFileImportRelativePath(addonSetupTypesFile, pikkuConfigType.typePath, packageMappings)}'`
      : '// Config type not found, will use fallback'

    const content = serializeAddonTypes(
      `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(addonSetupTypesFile, singletonServicesType.typePath, packageMappings)}'`,
      singletonServicesType.type,
      configTypeImport,
      `import type { RequiredSingletonServices } from '${getFileImportRelativePath(addonSetupTypesFile, servicesFile, packageMappings)}'`,
      `import { TypedSecretService } from '${getFileImportRelativePath(addonSetupTypesFile, secretsFile, packageMappings)}'`,
      `import { TypedVariablesService } from '${getFileImportRelativePath(addonSetupTypesFile, variablesFile, packageMappings)}'`,
      visitState.credentials?.definitions?.length > 0
        ? `import { TypedCredentialService } from '${getFileImportRelativePath(addonSetupTypesFile, credentialsFile, packageMappings)}'`
        : null
    )

    await writeFileInDir(logger, addonSetupTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating addon types',
      commandEnd: 'Created addon types',
    }),
  ],
})
