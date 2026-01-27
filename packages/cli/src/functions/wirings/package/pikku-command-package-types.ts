import { pikkuVoidFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCredentialTypes } from './serialize-package-types.js'

export const pikkuCredentialTypes = pikkuVoidFunc({
  func: async ({ logger, config }) => {
    const { credentialTypesFile } = config
    const content = serializeCredentialTypes()
    await writeFileInDir(logger, credentialTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Credential types',
      commandEnd: 'Created Credential types',
    }),
  ],
})
