import type { QueueWorkersMeta } from '@pikku/core/queue'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { TypesMap } from '@pikku/inspector'
import { FunctionsMeta, Logger } from '@pikku/core'
import { generateCustomTypes } from '../../../utils/custom-types-generator.js'

export const serializeQueueMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  queueWorkersMeta: QueueWorkersMeta
) => {
  const requiredTypes = new Set<string>()
  const serializedCustomTypes = generateCustomTypes(typesMap, requiredTypes)
  const serializedQueues = generateQueues(
    queueWorkersMeta,
    functionsMeta,
    typesMap,
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
  functionsMeta: FunctionsMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  // Initialize an object to collect queues
  const queuesObj: Record<string, { inputType: string; outputType: string }> =
    {}

  // Iterate through Queue metadata
  for (const [queueName, { pikkuFuncId }] of Object.entries(queueWorkersMeta)) {
    const functionMeta = functionsMeta[pikkuFuncId]
    if (!functionMeta) {
      throw new Error(
        `Function ${queueName} not found in functionsMeta. Please check your configuration.`
      )
    }

    const input = functionMeta.inputs ? functionMeta.inputs[0] : undefined
    const output = functionMeta.outputs ? functionMeta.outputs[0] : undefined

    // Store the input and output types for QueueHandler
    // For zod-derived schemas, the type might not be in typesMap, so use the schema name directly
    let inputType = 'null'
    if (input) {
      try {
        inputType = typesMap.getTypeMeta(input).uniqueName
      } catch {
        inputType = input
      }
    }
    let outputType = 'null'
    if (output) {
      try {
        outputType = typesMap.getTypeMeta(output).uniqueName
      } catch {
        outputType = output
      }
    }

    requiredTypes.add(inputType)
    requiredTypes.add(outputType)

    // Add Queue entry
    queuesObj[queueName] = {
      inputType,
      outputType,
    }
  }

  // Build the Queues object as a string
  let queuesStr = 'export type QueueMap = {\n'

  for (const [queueName, handler] of Object.entries(queuesObj)) {
    queuesStr += `  readonly '${queueName}': QueueHandler<${handler.inputType}, ${handler.outputType}>,\n`
  }

  queuesStr += '};\n'

  return queuesStr
}
