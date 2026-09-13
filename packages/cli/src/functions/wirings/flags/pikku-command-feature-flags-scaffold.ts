import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeFeatureFlagsScaffold } from './serialize-feature-flags-scaffold.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

export const pikkuFeatureFlagsScaffold = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables, getInspectorState }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (!config.scaffold?.featureFlags || !config.featureFlagsFile) {
      return false
    }

    const { featureFlags } = await getInspectorState()

    // Refuse rather than emit a wire whose response type is an empty union:
    // `Record<never, boolean>` compiles and is useless, and a client would
    // discover the project declared nothing by reading an empty object.
    if (featureFlags.definitions.length === 0) {
      logger.error(
        `scaffold.featureFlags is enabled but no defineFeatureFlags declaration was found. ` +
          `Add one in a source directory: \`defineFeatureFlags({ newCheckout: { description: 'The new checkout' } })\`.`
      )
      return false
    }

    const leaf = (name: string) =>
      getLeafImportPath(config.featureFlagsFile!, name, config)

    await writeFileInDir(
      logger,
      config.featureFlagsFile,
      serializeFeatureFlagsScaffold(leaf, config.globalHTTPPrefix || '')
    )
    await removeLegacyScaffoldFile(config.featureFlagsFile)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Feature Flag Wire',
      commandEnd: 'Generated Feature Flag Wire',
    }),
  ],
})
