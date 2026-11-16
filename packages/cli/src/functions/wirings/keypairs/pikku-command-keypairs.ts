import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeKeyPairsTypes } from './serialize-keypairs-types.js'
import { validateAndBuildKeyPairDefinitionsMeta } from '@pikku/core/keypair'

export const pikkuKeyPairs = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { keyPairsFile, keyPairsMetaJsonFile } = config

    if (!keyPairsFile) {
      return
    }

    const state = await getInspectorState()
    const meta = validateAndBuildKeyPairDefinitionsMeta(
      state.keyPairs.definitions
    )

    await writeFileInDir(logger, keyPairsFile, serializeKeyPairsTypes(meta))

    if (keyPairsMetaJsonFile) {
      await writeFileInDir(
        logger,
        keyPairsMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuKeyPairs types',
      commandEnd: 'Created PikkuKeyPairs types',
    }),
  ],
})
