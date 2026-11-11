import { InMemoryWorkflowService } from '../wirings/workflow/in-memory-workflow-service.js'
import { defineServiceTests } from './service-tests.js'

defineServiceTests({
  name: 'in-memory',
  services: {
    workflowCompensationQueued: async () => new InMemoryWorkflowService(),
  },
})
