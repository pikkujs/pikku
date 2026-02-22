import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeVariablesTypes } from './serialize-variables-types.js'
import { validateAndBuildVariableDefinitionsMeta } from '@pikku/core/variable'

export const pikkuVariables = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { variablesFile, variablesMetaJsonFile, packageMappings } = config

    if (!variablesFile) {
      return
    }

    const state = await getInspectorState()

    const content = serializeVariablesTypes({
      definitions: state.variables.definitions,
      schemaLookup: state.schemaLookup,
      variablesFile,
      packageMappings,
    })
    await writeFileInDir(logger, variablesFile, content)

    if (variablesMetaJsonFile) {
      const meta = validateAndBuildVariableDefinitionsMeta(
        state.variables.definitions,
        state.schemaLookup
      )
      await writeFileInDir(
        logger,
        variablesMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuVariables types',
      commandEnd: 'Created PikkuVariables types',
    }),
  ],
})
