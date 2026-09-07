import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { remoteJobsSchemasFile } from '../../../utils/remote-jobs-schemas-file.js'
import { serializeRemoteJobs } from './serialize-remote-jobs.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

export const pikkuRemoteJobs = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    const schemasFile = remoteJobsSchemasFile(config.remoteJobsFile)
    if (config.remoteJobsFile && schemasFile) {
      const leaf = (name: string) =>
        getLeafImportPath(config.remoteJobsFile!, name, config)
      const { schemas, functions } = serializeRemoteJobs(leaf)
      await writeFileInDir(logger, schemasFile, schemas)
      await writeFileInDir(logger, config.remoteJobsFile, functions)
      await removeLegacyScaffoldFile(config.remoteJobsFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Remote Jobs',
      commandEnd: 'Generated Remote Jobs',
    }),
  ],
})
