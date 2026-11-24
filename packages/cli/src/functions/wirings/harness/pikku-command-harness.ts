import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeHarnessGateNames,
  serializeHarnessMeta,
} from './serialize-harness.js'

export const pikkuHarnessMeta = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    // Both are written even when empty: a project that removes its last
    // harness must not keep the old meta, and the names type stays importable.
    await writeFileInDir(
      logger,
      config.harnessMetaJsonFile,
      serializeHarnessMeta(state)
    )
    await writeFileInDir(
      logger,
      config.harnessGateNamesFile,
      serializeHarnessGateNames(state)
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding harnesses',
      commandEnd: 'Found harnesses',
    }),
  ],
})
