import '../.pikku/pikku-bootstrap.gen.js'
import { runAIAgent, streamAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel, AIStreamEvent } from '@pikku/core/ai-agent'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../src/services.js'
import { randomUUID } from 'crypto'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const threadId = 'memory-test'
const params = { singletonServices, createWireServices }

console.log('=== runAIAgent Tests ===\n')

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

console.log('\n--- Turn 3: Router delegation (fetch todos + plan day) ---')
const r3 = await runAIAgent(
  'main-router',
  {
    message: 'Get my todos and plan out my day, suggest tasks accordingly',
    threadId: 'router-test',
    resourceId: 'test-user',
  },
  params
)
console.log('Response:', JSON.stringify(r3.object ?? r3.text, null, 2))

console.log('\n=== streamAIAgent Tests ===\n')

console.log('--- Stream: Ask daily-planner for advice ---')
const events: AIStreamEvent[] = []
const channel: AIStreamChannel = {
  channelId: `test-${randomUUID()}`,
  openingData: undefined,
  get state() {
    return 'open' as const
  },
  close: () => {},
  send: (event: AIStreamEvent) => {
    events.push(event)
    if (event.type === 'text-delta') {
      process.stdout.write(event.text)
    } else if (event.type === 'tool-call') {
      console.log(`\n  [tool-call] ${event.toolName}`)
    } else if (event.type === 'tool-result') {
      console.log(`  [tool-result] ${event.toolName}`)
    } else if (event.type === 'usage') {
      console.log(
        `  [usage] in=${event.tokens.input} out=${event.tokens.output}`
      )
    } else if (event.type === 'done') {
      console.log('\n  [done]')
    } else if (event.type === 'error') {
      console.log(`\n  [error] ${event.message}`)
    }
  },
}

await streamAIAgent(
  'daily-planner',
  {
    message: 'Plan my afternoon — I have 3 hours free',
    threadId: 'stream-test',
    resourceId: 'test-user',
  },
  channel,
  params
)

console.log(`\nTotal events: ${events.length}`)
const textDeltas = events.filter((e) => e.type === 'text-delta').length
const usageEvents = events.filter((e) => e.type === 'usage')
console.log(`Text deltas: ${textDeltas}`)
console.log(`Usage events: ${usageEvents.length}`)

process.exit(0)
