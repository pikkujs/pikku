import { pikkuRPC } from '../.pikku/pikku-rpc.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuRPC.setServerUrl(url)
console.log('Starting AI agent test with url:', url)

const TIMEOUT = 60000
const RETRY_INTERVAL = 2000
const start = Date.now()

const runId = Math.random().toString(36).slice(2, 8)
const threadId = `memory-test-${runId}`

async function testRunAgent() {
  console.log('--- Turn 1: Create a todo ---')
  const r1 = await pikkuRPC.agent('todo-assistant', {
    message: 'Create a todo called "Buy milk" with high priority',
    threadId,
    resourceId: 'test-user',
  })
  console.log('Response:', JSON.stringify(r1.result, null, 2))

  console.log('\n--- Turn 2: Ask about it (should remember) ---')
  const r2 = await pikkuRPC.agent('todo-assistant', {
    message: 'What did I just ask you to do?',
    threadId,
    resourceId: 'test-user',
  })
  console.log('Response:', JSON.stringify(r2.result, null, 2))

  console.log('\n--- Turn 3: Router delegation (fetch todos + plan day) ---')
  const r3 = await pikkuRPC.agent('main-router', {
    message: 'Get my todos and plan out my day, suggest tasks accordingly',
    threadId: `router-test-${runId}`,
    resourceId: 'test-user',
  })
  console.log('Response:', JSON.stringify(r3.result, null, 2))
}

async function testStreamAgent() {
  console.log('\n--- Stream: Ask daily-planner for advice ---')

  const response = await fetch(`${url}/rpc/agent/daily-planner/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: 'Plan my afternoon — I have 3 hours free',
      threadId: `stream-test-${runId}`,
      resourceId: 'test-user',
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(
      `Stream failed: ${response.status} ${await response.text()}`
    )
  }

  let eventCount = 0
  let textDeltas = 0
  let usageEvents = 0

  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      eventCount++

      switch (data.type) {
        case 'text-delta':
          textDeltas++
          process.stdout.write(data.text)
          break
        case 'tool-call':
          console.log(`\n  [tool-call] ${data.toolName}`)
          break
        case 'tool-result':
          console.log(`  [tool-result] ${data.toolName}`)
          break
        case 'usage':
          usageEvents++
          console.log(
            `\n  [usage] in=${data.tokens.input} out=${data.tokens.output}`
          )
          break
        case 'done':
          console.log('  [done]')
          break
        case 'error':
          console.log(`\n  [error] ${data.message}`)
          break
      }
    }
  }

  console.log(`Total events: ${eventCount}`)
  console.log(`Text deltas: ${textDeltas}`)
  console.log(`Usage events: ${usageEvents}`)
}

async function check() {
  try {
    await testRunAgent()
    await testStreamAgent()
    console.log('\n✅ AI agent test passed')
    process.exit(0)
  } catch (err: any) {
    console.log(`Still failing (${err.message ?? err}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ AI agent test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
