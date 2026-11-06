import { InMemoryQueueService } from '../../wirings/queue/in-memory-queue-service.js'
import { defineQueueTraceConformance } from '../queue-trace-conformance.js'

defineQueueTraceConformance(
  'in-memory',
  async () => {
    const service = new InMemoryQueueService()
    return {
      service,
      startWorkers: async () => {},
      stop: async () => {},
      publishRaw: async (queueName, payload) => {
        await service.add(queueName, payload)
      },
    }
  },
  { settleMs: 3_000 }
)
