import assert from 'node:assert/strict'
import { runQueueJob } from '@pikku/core'
import { pikkuState } from '@pikku/core/internal'
import '../.pikku/pikku-bootstrap.gen.js'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../src/services.js'
import { TodoStore } from '../src/services/store.service.js'

async function main() {
  const config = await createConfig()
  const todoStore = new TodoStore()
  const singletonServices = await createSingletonServices(config, { todoStore })

  pikkuState(null, 'package', 'singletonServices', singletonServices)
  pikkuState(null, 'package', 'factories', {
    createConfig,
    createSingletonServices,
    createWireServices,
  } as any)

  const result = await runQueueJob({
    job: {
      id: 'queue-test-1',
      queueName: 'todo-reminders',
      data: {
        todoId: 'todo1',
        userId: 'user1',
      },
      status: () => 'active',
    },
  })

  assert.equal(
    (result as { processed?: boolean }).processed,
    true,
    'Queue worker did not report success'
  )
  assert.match(
    (result as { message?: string }).message ?? '',
    /Reminder sent/,
    'Queue worker returned unexpected message'
  )

  console.log('Queue test passed')
}

main().catch((error) => {
  console.error('Queue test failed:', error)
  process.exit(1)
})
