import { pikkuSessionlessFunc } from '#pikku'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { writeAllServiceMetadata } from '@pikku/inspector'

export const pikkuServiceMetadata = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()

    // Only write service metadata if there are services to document
    if (state.serviceMetadata && state.serviceMetadata.length > 0) {
      writeAllServiceMetadata(state.serviceMetadata, config.outDir)
      logger.debug(
        `• Wrote ${state.serviceMetadata.length} service metadata files`
      )
    } else {
      logger.debug('• No service metadata to write')
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating service metadata',
      commandEnd: 'Generated service metadata',
    }),
  ],
})
