import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeTriggerMeta,
  serializeTriggerMetaTS,
} from './serialize-trigger-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuTrigger = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      triggersWiringFile,
      triggersWiringMetaFile,
      triggersWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { triggers } = visitState

    if (Object.keys(triggers.meta).length === 0) {
      return undefined
    }

    const fullMeta = serializeTriggerMeta(triggers.meta)

    // Write minimal JSON (runtime-only fields)
    const minimalMeta = stripVerboseFields(fullMeta)
    await writeFileInDir(
      logger,
      triggersWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
    if (hasVerboseFields(fullMeta)) {
      const verbosePath = triggersWiringMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(fullMeta, null, 2)
      )
    }

    const jsonImportPath = getFileImportRelativePath(
      triggersWiringMetaFile,
      triggersWiringMetaJsonFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      triggersWiringMetaFile,
      serializeTriggerMetaTS(
        triggers.meta,
        jsonImportPath,
        schema?.supportsImportAttributes ?? false
      )
    )

    await writeFileInDir(
      logger,
      triggersWiringFile,
      serializeFileImports(
        'wireTrigger',
        triggersWiringFile,
        triggers.files,
        packageMappings
      )
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding triggers',
      commandEnd: 'Found triggers',
    }),
  ],
})
