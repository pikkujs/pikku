import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'
import { serializeOtlpRunsScaffold } from './serialize-otlp-runs-scaffold.js'

export const pikkuOtlpRunsScaffold = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (!config.scaffold?.otlpRuns || !config.otlpRunsFile) {
      return false
    }

    await writeFileInDir(
      logger,
      config.otlpRunsFile,
      serializeOtlpRunsScaffold(
        (name) => getLeafImportPath(config.otlpRunsFile!, name, config),
        config.globalHTTPPrefix || ''
      )
    )
    await removeLegacyScaffoldFile(config.otlpRunsFile)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Live Runs Scaffold',
      commandEnd: 'Generated Live Runs Scaffold',
    }),
  ],
})
