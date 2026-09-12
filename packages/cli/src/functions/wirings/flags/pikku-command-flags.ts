import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeFlagsTypes } from './serialize-flags-types.js'
import { validateAndBuildFeatureFlagDefinitionsMeta } from '@pikku/core/flag'

export const pikkuFlags = pikkuSessionlessFunc<{ bootstrap?: boolean }, void>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { flagsFile, flagsMetaJsonFile } = config

    if (!flagsFile) {
      return
    }

    // Same cold-start reasoning as Roles: on a bare .pikku this runs before the
    // function leaf exists, so it takes the zero state. The file only has to
    // exist so a function can import FeatureFlagName; the real Flags step
    // regenerates it with the declarations once setup has run.
    const bootstrap = data?.bootstrap ?? false
    const state = await getInspectorState(false, bootstrap, bootstrap)

    const content = serializeFlagsTypes({
      definitions: state.featureFlags.definitions,
    })
    await writeFileInDir(logger, flagsFile, content)

    if (flagsMetaJsonFile) {
      const meta = validateAndBuildFeatureFlagDefinitionsMeta(
        state.featureFlags.definitions
      )
      await writeFileInDir(
        logger,
        flagsMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuFlags types',
      commandEnd: 'Created PikkuFlags types',
    }),
  ],
})
