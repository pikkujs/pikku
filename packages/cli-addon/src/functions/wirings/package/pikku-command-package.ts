import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePackageFactories } from './serialize-package.js'

export const pikkuPackage = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { addonName, packageMappings, packageFile } = config

    // Only generate for addon packages
    if (!addonName) {
      logger.debug({
        message:
          'Skipping package factories - not an addon package (addonName not set)',
        type: 'skip',
      })
      return false
    }

    if (!packageFile) {
      logger.debug({
        message: 'Skipping package factories - packageFile not configured',
        type: 'skip',
      })
      return false
    }

    const state = await getInspectorState()
    const { filesAndMethods } = state

    const {
      pikkuConfigFactory,
      singletonServicesFactory,
      wireServicesFactory,
    } = filesAndMethods

    // Build credential metadata for this addon package
    const credentialsMeta: Record<
      string,
      {
        name: string
        displayName: string
        type: 'singleton' | 'wire'
        oauth2?: boolean
      }
    > = {}
    if (state.credentials?.definitions) {
      for (const def of state.credentials.definitions) {
        credentialsMeta[def.name] = {
          name: def.name,
          displayName: def.displayName ?? def.name,
          type: def.type ?? 'singleton',
          oauth2: !!def.oauth2,
        }
      }
    }

    const content = serializePackageFactories(
      packageFile,
      addonName,
      pikkuConfigFactory
        ? {
            file: pikkuConfigFactory.file,
            variable: pikkuConfigFactory.variable,
          }
        : undefined,
      singletonServicesFactory
        ? {
            file: singletonServicesFactory.file,
            variable: singletonServicesFactory.variable,
          }
        : undefined,
      wireServicesFactory
        ? {
            file: wireServicesFactory.file,
            variable: wireServicesFactory.variable,
          }
        : undefined,
      packageMappings,
      Object.keys(credentialsMeta).length > 0 ? credentialsMeta : undefined,
      state.addonRequiredParentServices
    )

    if (!content) {
      logger.info({
        message: 'Skipping package factories - no service factories found',
        type: 'skip',
      })
      return false
    }

    await writeFileInDir(logger, packageFile, content)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating package service factories',
      commandEnd: 'Generated package service factories',
    }),
  ],
})
