export const serializeQueueWrapper = (queueMapPath: string) => {
  return `
import type { QueueService, QueueJob } from '@pikku/core/queue'
import type { QueueMap, TypedPikkuQueue } from '${queueMapPath}'

export class PikkuQueue implements TypedPikkuQueue {
    constructor(private queueService: QueueService) {}

    public async add<Name extends keyof QueueMap>(
        queueName: Name,
        data: QueueMap[Name]['input'],
        options?: {
            priority?: number
            delay?: number
            attempts?: number
            removeOnComplete?: number
            removeOnFail?: number
            jobId?: string
        }
    ): Promise<string> {
        return this.queueService.add(queueName as string, data, options);
    }

    public async getJob<Name extends keyof QueueMap>(
        queueName: Name,
        jobId: string
    ): Promise<QueueJob<QueueMap[Name]['input'], QueueMap[Name]['output']> | null> {
        return this.queueService.getJob<QueueMap[Name]['input'], QueueMap[Name]['output']>(
            queueName as string,
            jobId
        );
    }
}
`
}
