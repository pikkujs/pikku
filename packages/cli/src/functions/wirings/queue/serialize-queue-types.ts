/**
 * Generates type definitions for queue wirings
 */
export const serializeQueueTypes = (
  functionTypesImportPath: string,
  { addon = false }: { addon?: boolean } = {}
) => {
  return `/**
 * Queue-specific type definitions for tree-shaking optimization
 */

${addon ? '' : `import { wireQueueWorker as wireQueueWorkerCore } from '@pikku/core/queue'\n`}import { CoreQueueWorker } from '@pikku/core/queue'
import type { PikkuFunctionConfig } from '${functionTypesImportPath}'

/**
 * Type definition for queue workers that process background jobs.
 *
 * @template In - Input type for the queue job
 * @template Out - Output type for the queue job
 */
type QueueWiring<In, Out> = CoreQueueWorker<PikkuFunctionConfig<In, Out, 'session' | 'rpc'>>
${
  addon
    ? ''
    : `
/**
 * Registers a queue worker with the Pikku framework.
 * Workers process background jobs from queues.
 *
 * @param queueWorker - Queue worker definition with job handler
 */
export const wireQueueWorker = (queueWorker: QueueWiring<any, any>) => {
  wireQueueWorkerCore(queueWorker as any)
}
`
}`
}
