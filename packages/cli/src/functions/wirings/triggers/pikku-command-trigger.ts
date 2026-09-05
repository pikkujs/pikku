import { pikkuSessionlessFunc } from '#pikku/function'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeTriggerMeta,
  serializeTriggerMetaTS,
  serializeTriggerSourceMeta,
  serializeTriggerSourceMetaTS,
} from './serialize-trigger-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeWiringMeta } from '../../../utils/write-wiring-meta.js'

export const pikkuTrigger = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      triggersWiringFile,
      triggersWiringMetaFile,
      triggersWiringMetaJsonFile,
      triggerSourcesMetaFile,
      triggerSourcesMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { triggers } = visitState

    if (Object.keys(triggers.meta).length === 0) {
      return undefined
    }

    const fullMeta = serializeTriggerMeta(triggers.meta)

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false

    await writeWiringMeta({
      logger,
      meta: fullMeta,
      metaJsonFile: triggersWiringMetaJsonFile,
      metaFile: triggersWiringMetaFile,
      packageMappings,
      supportsImportAttributes,
      serializeMetaTS: ({ jsonImportPath }) =>
        serializeTriggerMetaTS(
          triggers.meta,
          jsonImportPath,
          supportsImportAttributes
        ),
    })

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

    const sourceMetaJson = serializeTriggerSourceMeta(triggers.sourceMeta)
    await writeFileInDir(
      logger,
      triggerSourcesMetaJsonFile,
      JSON.stringify(sourceMetaJson, null, 2)
    )

    const sourceMetaJsonImportPath = getFileImportRelativePath(
      triggerSourcesMetaFile,
      triggerSourcesMetaJsonFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      triggerSourcesMetaFile,
      serializeTriggerSourceMetaTS(
        triggers.sourceMeta,
        sourceMetaJsonImportPath,
        schema?.supportsImportAttributes ?? false
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
