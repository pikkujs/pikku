import { readFile } from 'node:fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { providerTypesSource } from '../../../providers/provider-types-source.js'

/** More passes than this means the services' types depend on each other in a loop. */
export const MAX_SERVICE_TYPE_PASSES = 5

const readIfPresent = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, 'utf-8')
  } catch {
    return undefined
  }
}

/**
 * Writes `#pikku/provider` until it stops changing. What a service provides is
 * read from its factory's return type, and the factory can destructure its
 * `services` from the very type this file declares, so each pass inspects the
 * tree the last one left and the result is only trusted once a pass writes
 * nothing new.
 */
export const providerTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    if (config.addon) return
    const file = config.providerTypesFile
    for (let pass = 0; pass < MAX_SERVICE_TYPE_PASSES; pass++) {
      const state = await getInspectorState(pass > 0)
      const source = providerTypesSource(state, config)
      // The writer puts its header above the source, so compare the tail.
      if ((await readIfPresent(file))?.endsWith(source)) return
      await writeFileInDir(logger, file, source)
    }
    throw new Error(
      `The services' types did not settle after ${MAX_SERVICE_TYPE_PASSES} passes: what a service provides keeps changing with the types generated from the others. Check that no defineProvider destructures a key that it, or a service that needs it, provides.`
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating service types',
      commandEnd: 'Generated service types',
    }),
  ],
})
