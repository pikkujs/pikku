/**
 * Test script for HAPPY PATH workflow retry
 * Should succeed after one retry
 */

import { pikkuFetch } from '../../functions/.pikku/pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'

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

    const response = await pikkuFetch(API_URL).rpc('happyRetry', { value: 10 })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Result:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Verify the expected result
    if (response.finalAttempt === 2) {
      console.log('\n✅ PASS: Workflow succeeded on attempt #2 (as expected)')
    } else {
      console.log(
        `\n❌ FAIL: Expected finalAttempt=2, got ${response.finalAttempt}`
      )
      process.exit(1)
    }

    if (response.result === 20) {
      console.log('✅ PASS: Result is correct (10 * 2 = 20)')
    } else {
      console.log(`❌ FAIL: Expected result=20, got ${response.result}`)
      process.exit(1)
    }

    console.log('\n🎉 All tests passed!\n')
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
