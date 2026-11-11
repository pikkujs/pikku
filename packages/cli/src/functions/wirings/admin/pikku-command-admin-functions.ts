import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'
import { serializeAdminFunctions } from './serialize-admin-functions.js'

export const pikkuAdminFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }
    if (!config.scaffold?.admin || !config.adminFunctionsFile) {
      return false
    }
    const leaf = (name: string) =>
      getLeafImportPath(config.adminFunctionsFile!, name, config)
    await writeFileInDir(
      logger,
      config.adminFunctionsFile,
      serializeAdminFunctions(leaf, config.globalHTTPPrefix || '')
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Admin functions',
      commandEnd: 'Generated Admin functions',
    }),
  ],
})
