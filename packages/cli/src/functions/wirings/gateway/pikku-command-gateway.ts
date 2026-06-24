import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import {
  serializeGatewayMeta,
  serializeGatewayMetaTS,
} from './serialize-gateway-meta.js'

export const pikkuGateway = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      gatewaysWiringFile,
      gatewaysWiringMetaFile,
      gatewaysWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { gateways } = visitState

    if (Object.keys(gateways.meta).length === 0) {
      return undefined
    }

    const fullMeta = serializeGatewayMeta(gateways.meta)
    const minimalMeta = stripVerboseFields(fullMeta)
    await writeFileInDir(
      logger,
      gatewaysWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    if (hasVerboseFields(fullMeta)) {
      const verbosePath = gatewaysWiringMetaJsonFile.replace(
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
      gatewaysWiringMetaFile,
      gatewaysWiringMetaJsonFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      gatewaysWiringMetaFile,
      serializeGatewayMetaTS(
        jsonImportPath,
        schema?.supportsImportAttributes ?? false
      )
    )

    await writeFileInDir(
      logger,
      gatewaysWiringFile,
      serializeFileImports(
        'wireGateway',
        gatewaysWiringFile,
        gateways.files,
        packageMappings
      )
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding gateways',
      commandEnd: 'Found gateways',
    }),
  ],
})
