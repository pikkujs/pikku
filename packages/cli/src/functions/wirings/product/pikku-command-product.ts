import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { canResolvePackage } from '../rpc/pikku-command-react-query.js'
import { serializeProductHooks } from './serialize-product-hooks.js'

export const pikkuProduct = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const productFile = config.clientFiles?.productFile
    const { packageMappings } = config

    if (!productFile) {
      logger.debug({
        message:
          'Skipping generating product hooks since this is not a backend SDK pass.',
        type: 'skip',
      })
      return
    }

    const { analytics, featureFlags } = await getInspectorState()

    // A hook is only worth emitting where its client can exist: the analytics
    // hook needs the ingest the scaffold writes (it is where `AnalyticsEvent`
    // comes from), the flag hook needs the flag endpoint.
    const analyticsFile =
      config.scaffold?.analytics && analytics?.length
        ? config.analyticsFile
        : undefined
    const flagsFile =
      config.scaffold?.featureFlags && featureFlags?.definitions?.length
        ? config.flagsFile
        : undefined

    if (!analyticsFile && !flagsFile) {
      logger.debug({
        message:
          'Skipping product hooks: the app declares no analytics events and no feature flags.',
        type: 'skip',
      })
      return
    }

    if (!canResolvePackage(config.configDir, '@pikku/react')) {
      logger.debug({
        message: `Skipping product hooks: @pikku/react not installed for ${config.configDir}.`,
        type: 'skip',
      })
      return
    }

    const importFrom = (file: string) =>
      getFileImportRelativePath(productFile, file, packageMappings)
    await writeFileInDir(
      logger,
      productFile,
      serializeProductHooks({
        analyticsPath: analyticsFile && importFrom(analyticsFile),
        flagsPath: flagsFile && importFrom(flagsFile),
      })
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating product hooks',
      commandEnd: 'Generated product hooks',
    }),
  ],
})
