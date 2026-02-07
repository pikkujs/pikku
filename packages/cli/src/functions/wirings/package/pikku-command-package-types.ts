import { pikkuVoidFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeSecretDefinitionTypes,
  serializeVariableDefinitionTypes,
} from './serialize-package-types.js'

export const pikkuSecretDefinitionTypes = pikkuVoidFunc({
  func: async ({ logger, config }) => {
    const { secretTypesFile } = config
    const content = serializeSecretDefinitionTypes()
    await writeFileInDir(logger, secretTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Secret definition types',
      commandEnd: 'Created Secret definition types',
    }),
  ],
})

export const pikkuVariableDefinitionTypes = pikkuVoidFunc({
  func: async ({ logger, config }) => {
    const { variableTypesFile } = config
    const content = serializeVariableDefinitionTypes()
    await writeFileInDir(logger, variableTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Variable definition types',
      commandEnd: 'Created Variable definition types',
    }),
  ],
})
