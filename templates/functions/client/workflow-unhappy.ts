/**
 * Test script for UNHAPPY PATH workflow retry (PostgreSQL backend)
 * Should fail after exhausting all retries
 */

import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

async function main() {
  console.log('🧪 Testing UNHAPPY PATH Workflow Retry\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Step attempt #1 → FAILS')
  console.log('  3. Workflow retries after 2s delay')
  console.log('  4. Step attempt #2 → FAILS')
  console.log('  5. Workflow retries after 2s delay')
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
    if (!response.error || response.attempts === undefined || !response.steps) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { error, attempts, steps }')
      console.log('Got:', response)
      process.exit(1)
    }

    // Verify attempts is 3 (all attempts exhausted)
    if (response.attempts !== 3) {
      console.log(`\n❌ FAIL: Expected 3 attempts, got ${response.attempts}`)
      process.exit(1)
    }

    // Verify steps array has exactly 3 entries (all failed)
    if (response.steps.length !== 3) {
      console.log(
        `\n❌ FAIL: Expected 3 step entries, got ${response.steps.length}`
      )
      console.log('Steps:', JSON.stringify(response.steps, null, 2))
      process.exit(1)
    }

    // Verify each step failed with increasing attemptCount
    for (let i = 0; i < 3; i++) {
      const step = response.steps[i]
      const expectedAttempt = i + 1

      if (
        step.attemptCount !== expectedAttempt ||
        step.status !== 'failed' ||
        !step.error
      ) {
        console.log(
          `\n❌ FAIL: Step ${i} should have failed on attempt ${expectedAttempt}`
        )
        console.log('Got:', JSON.stringify(step, null, 2))
        process.exit(1)
      }
    }

    console.log('\n✅ PASS: All validations passed!')
    console.log(`   Error: ${response.error}`)
    console.log(`   All 3 attempts exhausted (as expected)`)
    console.log(`   Step 1 (attempt 1): ${response.steps[0]!.error?.message}`)
    console.log(`   Step 2 (attempt 2): ${response.steps[1]!.error?.message}`)
    console.log(`   Step 3 (attempt 3): ${response.steps[2]!.error?.message}`)
    console.log(
      '\n🎉 Test passed - workflow correctly failed after exhausting retries!\n'
    )
    process.exit(0)
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
