import { QueueWorkersMeta } from '@pikku/core/queue'

export const serializeQueueMeta = (queueWorkersMeta: QueueWorkersMeta) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('queue', 'meta', ${JSON.stringify(queueWorkersMeta, null, 2)})`
  )
  return serializedOutput.join('\n')
}
