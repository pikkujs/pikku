import { pikkuSessionlessFunc } from '#pikku/function'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { writeWiringMeta } from '../../../utils/write-wiring-meta.js'
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
    const supportsImportAttributes = schema?.supportsImportAttributes ?? false

    await writeWiringMeta({
      logger,
      meta: fullMeta,
      metaJsonFile: gatewaysWiringMetaJsonFile,
      metaFile: gatewaysWiringMetaFile,
      packageMappings,
      supportsImportAttributes,
      serializeMetaTS: ({ jsonImportPath }) =>
        serializeGatewayMetaTS(jsonImportPath, supportsImportAttributes),
    })

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
