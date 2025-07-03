import { queueWorkersMeta } from '@pikku/core'

export const serializeQueueMeta = (queueWorkersMeta: queueWorkersMeta) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('queue', 'meta', ${JSON.stringify(queueWorkersMeta, null, 2)})`
  )
  return serializedOutput.join('\n')
}
