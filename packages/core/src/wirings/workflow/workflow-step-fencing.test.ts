import { defineServiceTests } from '../../testing/service-tests.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'

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
        forceStepStatus: async (runId, stepName, status) => {
          const step = await service.getStepState(runId, stepName)
          step.status = status as typeof step.status
        },
      }
    },
  },
})
