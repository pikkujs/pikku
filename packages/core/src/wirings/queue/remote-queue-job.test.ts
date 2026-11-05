import { defineQueueIdentityTransportTests } from '../../testing/queue-identity-transport-tests.js'
import { pikkuRemoteQueueJobFunc } from './remote-queue-job.js'

defineQueueIdentityTransportTests('remote queue jobs', ({ logger }) => {
  const sent: Array<[string, unknown, Record<string, string> | undefined]> = []
  return {
    queueService: {
      supportsResults: false,
      add: async (queueName: string, data: unknown, options?: any) => {
        sent.push([queueName, data, options])
        return String(sent.length)
      },
      getJob: async () => null,
    },
    deliver: async () => {
      for (const [queueName, data, options] of sent.splice(0)) {
        await pikkuRemoteQueueJobFunc(
          { logger },
          {
            queueName,
            data,
            traceparent: options?.traceparent,
            pikkuUserId: options?.pikkuUserId,
          }
        )
      }
    },
  }
})
