/**
 * Test script for HAPPY PATH workflow retry (PostgreSQL backend)
 * Should succeed after one retry
 */

import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

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
    if (
      response.result === undefined ||
      response.finalAttempt === undefined ||
      !response.message ||
      !response.steps
    ) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { result, finalAttempt, message, steps }')
      console.log('Got:', response)
      process.exit(1)
    }

    // Verify the finalAttempt is 2 (failed on attempt 1, succeeded on attempt 2)
    if (response.finalAttempt !== 2) {
      console.log(
        `\n❌ FAIL: Expected finalAttempt to be 2, got ${response.finalAttempt}`
      )
      process.exit(1)
    }

    // Verify steps array has exactly 2 entries (failed attempt 1, succeeded attempt 2)
    if (response.steps.length !== 2) {
      console.log(
        `\n❌ FAIL: Expected 2 step entries, got ${response.steps.length}`
      )
      console.log('Steps:', JSON.stringify(response.steps, null, 2))
      process.exit(1)
    }

    // Verify first step failed on attempt 1
    const failedStep = response.steps[0]!
    if (
      failedStep.attemptCount !== 1 ||
      failedStep.status !== 'failed' ||
      !failedStep.error
    ) {
      console.log('\n❌ FAIL: First step should have failed on attempt 1')
      console.log('Got:', JSON.stringify(failedStep, null, 2))
      process.exit(1)
    }

    // Verify second step succeeded on attempt 2
    const succeededStep = response.steps[1]!
    if (
      succeededStep.attemptCount !== 2 ||
      succeededStep.status !== 'succeeded'
    ) {
      console.log('\n❌ FAIL: Second step should have succeeded on attempt 2')
      console.log('Got:', JSON.stringify(succeededStep, null, 2))
      process.exit(1)
    }

    console.log('\n✅ PASS: All validations passed!')
    console.log(`   Result: ${response.result}`)
    console.log(`   Message: ${response.message}`)
    console.log(`   Failed step (attempt 1): ${failedStep.error?.message}`)
    console.log(`   Succeeded step (attempt 2): ${succeededStep.status}`)
    console.log(
      '\n🎉 Test passed - workflow correctly retried and succeeded!\n'
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
