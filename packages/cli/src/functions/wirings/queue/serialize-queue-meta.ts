import { QueueWorkersMeta } from '@pikku/core/queue'
import { serializeMetaTS } from '../../../utils/serialize-meta-ts.js'

export const serializeQueueMeta = (queueWorkersMeta: QueueWorkersMeta) => {
  return queueWorkersMeta
}

export const serializeQueueMetaTS = (
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  return serializeMetaTS({
    jsonImportPath,
    supportsImportAttributes,
    pikkuStateNamespace: 'queue',
    pikkuStateKey: 'meta',
    metaTypeImport: '@pikku/core/queue',
    metaTypeName: 'QueueWorkersMeta',
  })
}
