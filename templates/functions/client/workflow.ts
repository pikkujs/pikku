import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuFetch.setServerUrl(url)
console.log('Starting workflow test with url:', url)

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function check() {
  try {
    const result = await pikkuFetch.post('/workflow/create-todo', {
      userId: 'user1',
      title: 'Workflow test todo',
      priority: 'high',
      dueDate: '2025-12-31',
    })
    console.log('✅ Workflow test passed')
    console.log('Workflow started with runId:', result.runId)
    process.exit(0)
  } catch (err: any) {
    console.log(`Still failing (${err.message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ Workflow test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
