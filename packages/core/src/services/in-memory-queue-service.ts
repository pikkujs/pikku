import type {
  QueueService,
  QueueJob,
  JobOptions,
} from '../wirings/queue/queue.types.js'
import { runQueueJob } from '../wirings/queue/queue-runner.js'

export class InMemoryQueueService implements QueueService {
  readonly supportsResults = false
  private jobCounter = 0

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const jobId = `inmem-${++this.jobCounter}`

    const job: QueueJob<T> = {
      id: jobId,
      queueName,
      data,
      status: () => 'active',
      pikkuUserId: options?.pikkuUserId,
    }

    const delay = options?.delay ?? 0

    setTimeout(async () => {
      try {
        await runQueueJob({ job })
      } catch (e: any) {
        console.error(
          `[InMemoryQueue] Job ${jobId} on ${queueName} failed:`,
          e.message
        )
      }
    }, delay)

    return jobId
  }

  async getJob(): Promise<null> {
    return null
  }
}
