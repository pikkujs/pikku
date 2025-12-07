import { pikkuRPC } from '#pikku/pikku-rpc.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuRPC.setServerUrl(url)
console.log('Starting workflow test with url:', url)

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function check() {
  try {
    // Start the createAndNotifyWorkflow via exposed RPC
    const result = await pikkuRPC.invoke('startCreateAndNotifyWorkflow', {
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
