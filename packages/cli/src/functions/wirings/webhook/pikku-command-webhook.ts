import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeWebhook } from './serialize-webhook.js'

export const pikkuWebhook = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    const deployCodegenFlag = await variables.get('PIKKU_DEPLOY_CODEGEN')
    if (deployCodegenFlag === '1') {
      return false
    }

    if (config.webhookWorkersFile && config.webhookSchemasFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.webhookWorkersFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const { schemas, functions } = serializeWebhook(pathToPikkuTypes)
      await writeFileInDir(logger, config.webhookSchemasFile, schemas)
      await writeFileInDir(logger, config.webhookWorkersFile, functions)
      await removeLegacyScaffoldFile(config.webhookWorkersFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Webhook Workers',
      commandEnd: 'Generated Webhook Workers',
    }),
  ],
})
