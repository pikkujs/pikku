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

    // Validate before writing anything, and emit the union from the same
    // validated set the sidecar is built from. Two derivations of one
    // vocabulary can disagree, and a conflicting redeclaration used to throw
    // only after the .ts had already been written — leaving a union describing
    // a set the sidecar never got.
    const meta = validateAndBuildFeatureFlagDefinitionsMeta(
      state.featureFlags.definitions
    )

    const content = serializeFlagsTypes({ definitions: Object.values(meta) })
    await writeFileInDir(logger, flagsFile, content)

    if (flagsMetaJsonFile) {
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
