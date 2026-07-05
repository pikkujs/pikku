import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeScenarioFunctions } from './serialize-scenario-functions.js'

export const pikkuScenarioFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    const deployCodegenFlag = await variables.get('PIKKU_DEPLOY_CODEGEN')
    if (deployCodegenFlag === '1') {
      return false
    }

    if (config.scaffold?.scenarios && config.scenariosFunctionsFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.scenariosFunctionsFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.scenariosFunctionsFile,
        serializeScenarioFunctions(
          pathToPikkuTypes,
          config.scaffold.scenarios === 'auth'
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Scenario functions',
      commandEnd: 'Generated Scenario functions',
    }),
  ],
})
