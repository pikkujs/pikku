import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeVariablesTypes } from './serialize-variables-types.js'

export const pikkuVariables = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { variablesFile, packageMappings } = config

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
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuVariables types',
      commandEnd: 'Created PikkuVariables types',
    }),
  ],
})
