import { pikkuVoidFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeErrorTypes } from './serialize-error-types.js'

export const pikkuErrorTypes = pikkuVoidFunc({
  func: async ({ logger, config }) => {
    const { errorTypesFile } = config
    const content = serializeErrorTypes()
    await writeFileInDir(logger, errorTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating error types',
      commandEnd: 'Created error types',
    }),
  ],
})
