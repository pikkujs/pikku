import { pikkuRPC } from '../.pikku/pikku-rpc.gen.js'
import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuRPC.setServerUrl(url)
pikkuFetch.setServerUrl(url)
console.log('Starting agent HTTP test with url:', url)

const TIMEOUT = 60000
const RETRY_INTERVAL = 2000
const start = Date.now()

const runId = Math.random().toString(36).slice(2, 8)
const threadId = `memory-test-${runId}`

async function testRunAgent() {
  const loginResult = await pikkuFetch.post('/auth/login', {
    username: 'demo',
    password: 'password',
  })
  pikkuRPC.setAuthorizationJWT(loginResult.token)

  console.log('--- Turn 1: Create a todo ---')
  const r1 = await pikkuRPC.agent('todoAssistant', {
    message: 'Create a todo called "Buy milk" with high priority',
    threadId,
    resourceId: 'test-user',
  })
  console.log('Response:', JSON.stringify(r1.result, null, 2))

  console.log('\n--- Turn 2: Ask about it (should remember) ---')
  const r2 = await pikkuRPC.agent('todoAssistant', {
    message: 'What did I just ask you to do?',
    threadId,
    resourceId: 'test-user',
  })
  console.log('Response:', JSON.stringify(r2.result, null, 2))

  console.log('\n--- Turn 3: Router delegation (fetch todos + plan day) ---')
  const r3 = await pikkuRPC.agent('mainRouter', {
    message: 'Get my todos and plan out my day, suggest tasks accordingly',
    threadId: `router-test-${runId}`,
    resourceId: 'test-user',
  })
  console.log('Response:', JSON.stringify(r3.result, null, 2))
}

async function check() {
  try {
    await testRunAgent()
    console.log('\n✅ Agent HTTP test passed')
    process.exit(0)
  } catch (err: any) {
    console.log(`Still failing (${err.message ?? err}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ Agent HTTP test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
