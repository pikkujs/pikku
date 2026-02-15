import '../.pikku/pikku-bootstrap.gen.js'
import { runAIAgent } from '@pikku/core/ai-agent'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../src/services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const threadId = 'memory-test'
const params = { singletonServices, createWireServices }

console.log('--- Turn 1: Create a todo ---')
const r1 = await runAIAgent(
  'todo-assistant',
  {
    message: 'Create a todo called "Buy milk" with high priority',
    threadId,
    resourceId: 'test-user',
  },
  params
)
console.log('Response:', JSON.stringify(r1.object ?? r1.text, null, 2))

console.log('\n--- Turn 2: Ask about it (should remember) ---')
const r2 = await runAIAgent(
  'todo-assistant',
  {
    message: 'What did I just ask you to do?',
    threadId,
    resourceId: 'test-user',
  },
  params
)
console.log('Response:', JSON.stringify(r2.object ?? r2.text, null, 2))

process.exit(0)
