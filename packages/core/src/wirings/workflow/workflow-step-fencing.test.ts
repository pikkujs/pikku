import { defineServiceTests } from '../../testing/service-tests.js'
import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'

defineServiceTests({
  name: 'in-memory',
  services: {
    workflowFencing: async () => {
      const service = new InMemoryWorkflowService()
      return {
        service,
        lapseLease: async (runId, stepName) => {
          const step = await service.getStepState(runId, stepName)
          step.leaseExpiresAt = new Date(0)
        },
      }
    },
  },
})
