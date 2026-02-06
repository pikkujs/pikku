import { pikkuVoidFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSecretDefinitionTypes } from './serialize-package-types.js'

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
