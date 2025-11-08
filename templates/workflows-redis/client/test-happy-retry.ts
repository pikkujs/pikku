/**
 * Test script for HAPPY PATH workflow retry
 * Should succeed after one retry
 */

import { PikkuFetch } from '../../functions/.pikku/pikku-fetch.gen.js'

const pikkuFetch = new PikkuFetch()
pikkuFetch.setServerUrl('http://localhost:4002')

async function main() {
  console.log('🧪 Testing HAPPY PATH Workflow Retry\n')
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

    const response = await pikkuFetch.post('/workflow/test/happy-retry', {
      value: 10,
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Result:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Verify the response structure
    if (!response.result || !response.finalAttempt || !response.message) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { result, finalAttempt, message }')
      console.log('Got:', response)
      process.exit(1)
    }

    // Verify the finalAttempt is 2 (failed on attempt 1, succeeded on attempt 2)
    if (response.finalAttempt === 2) {
      console.log('\n✅ PASS: Step succeeded on attempt 2 (after 1 retry)')
      console.log(`   Result: ${response.result}`)
      console.log(`   Message: ${response.message}`)
      console.log(
        '\n🎉 Test passed - workflow correctly retried and succeeded!\n'
      )
      process.exit(0)
    } else {
      console.log(
        `\n❌ FAIL: Expected finalAttempt to be 2, got ${response.finalAttempt}`
      )
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
