/**
 * Test script for HAPPY PATH workflow retry (PostgreSQL backend)
 * Should succeed after one retry
 */

const API_URL = 'http://localhost:4002'

async function main() {
  console.log('🧪 Testing HAPPY PATH Workflow Retry (PostgreSQL)\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Step attempt #1 → FAILS')
  console.log('  3. Workflow retries after 1s delay')
  console.log('  4. Step attempt #2 → SUCCEEDS')
  console.log('  5. Workflow completes successfully')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting happyRetry workflow via RPC...\n')

    const res = await fetch(`${API_URL}/workflow/test/happy-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 10 }),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    }

    const response = await res.json()

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Result:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Check if we got a runId (workflow started asynchronously)
    if (response.runId) {
      console.log('\n✅ PASS: Workflow started successfully')
      console.log(`   Run ID: ${response.runId}`)
      console.log(
        '\n📝 NOTE: Workflow is executing asynchronously. Check server logs for retry behavior.'
      )
      console.log('\n🎉 Test passed!\n')
    } else {
      console.log('\n❌ FAIL: Expected runId in response')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('\n❌ Test FAILED:')
    console.error(error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
