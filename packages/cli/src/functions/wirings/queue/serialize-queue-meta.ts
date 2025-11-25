import { QueueWorkersMeta } from '@pikku/core/queue'

export const serializeQueueMeta = (queueWorkersMeta: QueueWorkersMeta) => {
  return queueWorkersMeta
}

export const serializeQueueMetaTS = (
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push("import { QueueWorkersMeta } from '@pikku/core/queue'")
  serializedOutput.push(importStatement)
  serializedOutput.push('')
  serializedOutput.push(
    "pikkuState(null, 'queue', 'meta', metaData as QueueWorkersMeta)"
  )
  return serializedOutput.join('\n')
}
