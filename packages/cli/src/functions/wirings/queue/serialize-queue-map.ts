import type { QueueWorkersMeta } from '@pikku/core/queue'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap, generateCustomTypes } from '@pikku/inspector'
import { Logger } from '@pikku/core/services'

export const serializeQueueMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  queueWorkersMeta: QueueWorkersMeta,
  resolvedIOTypes: Record<string, { inputType: string; outputType: string }>
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedQueues = generateQueues(
    queueWorkersMeta,
    resolvedIOTypes,
    requiredTypes
  )

  const serializedImportMap = serializeImportMap(
    logger,
    relativeToPath,
    packageMappings,
    typesMap,
    requiredTypes
  )

  return `/**
 * This provides the structure needed for typescript to be aware of Queue workers and their input/output types
 */

${serializedImportMap}
${serializedCustomTypes}

import type { QueueJob } from '@pikku/core/queue'

interface QueueHandler<I, O> {
    input: I;
    output: O;
}

${serializedQueues}

type QueueAdd = <Name extends keyof QueueMap>(
  name: Name,
  data: QueueMap[Name]['input'],
  options?: {
    priority?: number
    delay?: number
    attempts?: number
    removeOnComplete?: number
    removeOnFail?: number
    jobId?: string
  }
) => Promise<string>

type QueueGetJob = <Name extends keyof QueueMap>(
  name: Name,
  jobId: string
) => Promise<QueueJob<QueueMap[Name]['input'], QueueMap[Name]['output']> | null>

export type TypedPikkuQueue = {
  add: QueueAdd;
  getJob: QueueGetJob;
}
  `
}

function generateQueues(
  queueWorkersMeta: QueueWorkersMeta,
  resolvedIOTypes: Record<string, { inputType: string; outputType: string }>,
  requiredTypes: Set<string>
) {
  const queuesObj: Record<string, { inputType: string; outputType: string }> =
    {}

  for (const [queueName, { pikkuFuncId }] of Object.entries(queueWorkersMeta)) {
    const resolved = resolvedIOTypes[pikkuFuncId]
    if (!resolved) {
      throw new Error(
        `Function ${pikkuFuncId} not found in resolvedIOTypes. Please check your configuration.`
      )
    }
    requiredTypes.add(resolved.inputType)
    requiredTypes.add(resolved.outputType)
    queuesObj[queueName] = resolved
  }

  // Build the Queues object as a string
  let queuesStr = 'export type QueueMap = {\n'

  for (const [queueName, handler] of Object.entries(queuesObj)) {
    queuesStr += `  readonly '${queueName}': QueueHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }

  queuesStr += '};\n'

  return queuesStr
}
