import { PikkuRPC } from '../.pikku/pikku-rpc.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
const rpc = new PikkuRPC()
rpc.setServerUrl(url)
console.log('Starting workflow test with url:', url)

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function testWorkflowStart() {
  const result = await rpc.startWorkflow('createAndNotifyWorkflow', {
    userId: 'user1',
    title: 'Workflow test todo start/status',
    priority: 'high',
    dueDate: '2025-12-31',
  })
  if (!result.runId) {
    throw new Error('workflowStart: missing runId')
  }
  console.log('  workflowStart returned runId:', result.runId)
  return result.runId
}

async function testWorkflowRun() {
  const result = await rpc.startWorkflow('createAndNotifyWorkflow', {
    userId: 'user2',
    title: 'Workflow test todo inline',
    priority: 'high',
    dueDate: '2025-12-31',
  })
  console.log('  workflow (start) returned:', result)
}

async function check() {
  try {
    const runId = await testWorkflowStart()
    console.log(`  Got runId: ${runId}`)
    await testWorkflowRun()
    console.log('✅ All workflow tests passed')
    process.exit(0)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`Still failing (${message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ Workflow test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
