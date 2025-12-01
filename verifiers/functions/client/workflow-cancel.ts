/**
 * Test script for workflow cancellation (PostgreSQL backend)
 * Should cancel immediately when value is negative
 */

import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

async function main() {
  console.log('🧪 Testing Workflow Cancellation\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Workflow detects negative value')
  console.log('  3. Workflow cancels itself with reason')
  console.log('  4. Workflow status becomes "cancelled"')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting unhappyRetry workflow with negative value...\n')

    const response = await pikkuFetch.post('/workflow/test/unhappy-retry', {
      value: -5,
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ EXPECTED: Workflow was cancelled')
    console.log('\n📊 Response:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Check if error field indicates cancellation
    if (
      response.error &&
      (response.error.includes('cancelled') ||
        response.error.includes('negative'))
    ) {
      console.log('\n✅ PASS: Workflow was successfully cancelled')
      console.log(
        '\n🎉 Test passed - workflow correctly handled cancellation!\n'
      )
      process.exit(0)
    } else {
      console.log('\n❌ FAIL: Response does not indicate cancellation')
      console.log('Expected error field with cancellation message')
      process.exit(1)
    }
  } catch (error: any) {
    console.log('\n' + '='.repeat(70))
    console.log('\n❌ UNEXPECTED: Request failed with error')
    console.log('\n📊 Error details:')
    console.log(`  Message: ${error.message}`)
    console.log('\n' + '='.repeat(70))
    process.exit(1)
  }
}

main()
