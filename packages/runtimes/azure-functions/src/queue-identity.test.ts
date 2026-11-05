import { defineQueueIdentityTransportTests } from '@pikku/core/testing'

import { AzureQueueService } from './azure-queue-service.js'
import { createAzureHandler } from './handler-factories.js'

defineQueueIdentityTransportTests('azure storage queues', (services) => {
  const sent: string[] = []
  const queueService = new AzureQueueService(
    'DefaultEndpointsProtocol=http;AccountName=a;AccountKey=a2V5;QueueEndpoint=http://127.0.0.1:1/a;'
  )
  ;(queueService as any).getQueueClient = () => ({
    sendMessage: async (encoded: string) => {
      sent.push(encoded)
    },
  })
  const { queue } = createAzureHandler(
    {
      createConfig: async () => ({}),
      createSingletonServices: async () => services,
    } as any,
    ['queue']
  ) as { queue: (item: unknown, context: any) => Promise<void> }
  return {
    queueService,
    deliver: async () => {
      for (const encoded of sent.splice(0)) {
        // The storage trigger hands the handler the decoded message.
        await queue(
          JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')),
          { invocationId: 'i1', triggerMetadata: {} }
        )
      }
    },
  }
})
