/**
 * Test script for UNHAPPY PATH workflow retry (Redis backend)
 * Should fail after exhausting all retries
 */

import { PikkuFetch } from '../../functions/.pikku/pikku-fetch.gen.js'

const pikkuFetch = new PikkuFetch()
pikkuFetch.setServerUrl('http://localhost:4003')

async function main() {
  console.log('🧪 Testing UNHAPPY PATH Workflow Retry (Redis)\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Step attempt #1 → FAILS')
  console.log('  3. Workflow retries after 500ms delay')
  console.log('  4. Step attempt #2 → FAILS')
  console.log('  5. Workflow retries after 500ms delay')
  console.log('  6. Step attempt #3 → FAILS')
  console.log('  7. Retries exhausted → Workflow FAILS')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting unhappyRetry workflow via RPC...\n')

    const response = await pikkuFetch.post('/workflow/test/unhappy-retry', {
      value: 10,
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW FAILED AS EXPECTED!')
    console.log('\n📊 Response:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Verify the response structure
    if (!response.error || !response.attempts) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { error, attempts }')
      console.log('Got:', response)
      process.exit(1)
    }

    // Verify attempts is 3 (all attempts exhausted)
    if (response.attempts === 3) {
      console.log('\n✅ PASS: All 3 attempts exhausted (as expected)')
      console.log(`   Error: ${response.error}`)
      console.log(
        '\n🎉 Test passed - workflow correctly failed after exhausting retries!\n'
      )
      process.exit(0)
    } else {
      console.log(`\n❌ FAIL: Expected 3 attempts, got ${response.attempts}`)
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
