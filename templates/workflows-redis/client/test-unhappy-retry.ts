/**
 * Test script for UNHAPPY PATH workflow retry
 * Should fail after exhausting all retries
 */

import { pikkuFetch } from '../../functions/.pikku/pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'

async function main() {
  console.log('🧪 Testing UNHAPPY PATH Workflow Retry\n')
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

    const response = await pikkuFetch(API_URL).rpc('unhappyRetry', {
      value: 10,
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n❌ UNEXPECTED: Workflow should have failed but succeeded')
    console.log('\n📊 Response:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))
    process.exit(1)
  } catch (error: any) {
    console.log('\n' + '='.repeat(70))
    console.log('\n✅ EXPECTED: Workflow failed after exhausting retries')
    console.log('\n📊 Error details:')
    console.log(`  Message: ${error.message}`)

    // Check if error message indicates retry exhaustion
    if (
      error.message.includes('Attempt 3') ||
      error.message.includes('UNHAPPY')
    ) {
      console.log('\n✅ PASS: Error indicates retries were exhausted')
      console.log(
        '\n🎉 Test passed - workflow correctly failed after retries!\n'
      )
      process.exit(0)
    } else {
      console.log('\n❌ FAIL: Error message unexpected')
      console.log('Full error:', error)
      process.exit(1)
    }
  }
}

main()
