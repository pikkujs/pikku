import assert from 'node:assert/strict'
import { InMemoryTriggerService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from '../src/services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import { TodoStore } from '../src/services/store.service.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const config = await createConfig()
  const todoStore = new TodoStore()
  const singletonServices = await createSingletonServices(config, { todoStore })
  const triggerService = new InMemoryTriggerService()
  triggerService.setServices(singletonServices)
  const getTriggerTodos = () => todoStore.getTodosByUser('trigger')

  await triggerService.start()
  await sleep(2_500)
  assert(getTriggerTodos().length > 0, 'Trigger never fired')

  await triggerService.stop()
  const countAtStop = getTriggerTodos().length
  await sleep(2_500)
  assert.equal(
    getTriggerTodos().length,
    countAtStop,
    'Trigger kept firing after stop'
  )

  console.log('✅ Trigger test passed')
}

main().catch((err) => {
  console.error('❌ Trigger test failed:', err)
  process.exit(1)
})
