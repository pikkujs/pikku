import { defineServiceTests } from '../testing/service-tests.js'
import { InMemoryLockService } from './in-memory-lock-service.js'

defineServiceTests({
  name: 'in-memory',
  services: { lockService: async () => new InMemoryLockService() },
})
