import { QueueWorkersMeta } from '@pikku/core/queue'

export const serializeQueueMeta = (queueWorkersMeta: QueueWorkersMeta) => {
  return queueWorkersMeta
}

export const generateQueueRuntimeMeta = (
  queueWorkersMeta: QueueWorkersMeta
) => {
  const runtimeMeta: any = {}

  for (const [workerName, workerMeta] of Object.entries(queueWorkersMeta)) {
    const { summary, description, errors, ...runtime } = workerMeta as any
    runtimeMeta[workerName] = runtime
  }

  return runtimeMeta
}

export const serializeQueueMetaTS = (
  jsonImportPath: string,
  supportsImportAttributes: boolean = false
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
    "pikkuState('queue', 'meta', metaData as QueueWorkersMeta)"
  )
  return serializedOutput.join('\n')
}
