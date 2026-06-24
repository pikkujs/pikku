import type { GatewaysMeta } from '@pikku/core/gateway'
import { serializeMetaTS } from '../../../utils/serialize-meta-ts.js'

export const serializeGatewayMeta = (gatewayMeta: GatewaysMeta) => {
  return gatewayMeta
}

export const serializeGatewayMetaTS = (
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  return serializeMetaTS({
    jsonImportPath,
    supportsImportAttributes,
    pikkuStateNamespace: 'gateway',
    pikkuStateKey: 'meta',
    metaTypeImport: '@pikku/core/gateway',
    metaTypeName: 'GatewaysMeta',
  })
}
