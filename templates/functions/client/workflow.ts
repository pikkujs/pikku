import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuFetch.setServerUrl(url)
console.log('Starting workflow test with url:', url)

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function testWorkflowStart() {
  const result = await pikkuFetch.post('/workflow/create-todo', {
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

async function testWorkflowStatus(runId: string) {
  const result = await pikkuFetch.get('/workflow/status/:runId', { runId })
  if (!result.id || !result.status) {
    throw new Error('workflowStatus: missing id or status')
  }
  console.log('  workflowStatus returned:', {
    id: result.id,
    status: result.status,
  })
}

async function testWorkflowRun() {
  const result = await pikkuFetch.post('/workflow/run-todo', {
    userId: 'user2',
    title: 'Workflow test todo inline',
    priority: 'high',
    dueDate: '2025-12-31',
  })
  console.log('  workflow (run-to-completion) returned:', result)
}

async function check() {
  try {
    const runId = await testWorkflowStart()
    await testWorkflowStatus(runId)
    await testWorkflowRun()
    console.log('✅ All workflow tests passed')
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
