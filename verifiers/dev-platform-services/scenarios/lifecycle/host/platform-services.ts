import { basename, dirname } from 'node:path'
import { pikkuPlatformServices } from '@pikku/core/lifecycle'
import { createScriptContent, putText } from '../src/script-content.js'

/** A host's platform services: the app reads `hostTag` without building it. */
export const createPlatformServices = pikkuPlatformServices<{
  hostTag: { tag: string | undefined; stop: () => Promise<void> }
}>((env) => ({
  hostTag: {
    tag: env.PIKKU_HOST_TAG,
    stop: async () => {
      const file = env.PIKKU_HOST_STOP_LOG
      if (!file) return
      await putText(
        createScriptContent(dirname(file)),
        'hooks',
        basename(file),
        'host:stop'
      )
    },
  },
}))
