import { QueueProcessorsMeta } from '@pikku/core'

export const serializeQueueMeta = (
  queueProcessorsMeta: QueueProcessorsMeta
) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('queue', 'meta', ${JSON.stringify(queueProcessorsMeta, null, 2)})`
  )
  return serializedOutput.join('\n')
}
