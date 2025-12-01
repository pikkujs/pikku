/**
 * Test script for Graph-based User Onboarding Workflow
 * Tests the pikkuWorkflowGraph with sequential flow and input refs
 */

import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

async function main() {
  console.log('🧪 Testing Graph-based User Onboarding Workflow\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts with entry node (createUserProfile)')
  console.log('  2. User profile is created')
  console.log('  3. Flow moves to sendWelcome node (sendEmail)')
  console.log('  4. Welcome email is sent using ref() to entry output')
  console.log('  5. Workflow completes successfully')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting graph onboarding workflow...\n')

    const response = await pikkuFetch.post('/workflow/graph-onboarding', {
      email: 'graph-test@example.com',
      userId: 'graph-user-123',
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Result:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Verify the response structure - should have output from the last node (sendEmail)
    if (response.sent === undefined || !response.messageId || !response.to) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { sent, messageId, to }')
      console.log('Got:', response)
      process.exit(1)
    }

    // Verify the email was sent to the correct address (from ref)
    if (response.to !== 'graph-test@example.com') {
      console.log(
        `\n❌ FAIL: Expected email to be sent to 'graph-test@example.com', got '${response.to}'`
      )
      process.exit(1)
    }

    // Verify sent flag is true
    if (response.sent !== true) {
      console.log(`\n❌ FAIL: Expected sent to be true, got ${response.sent}`)
      process.exit(1)
    }

    console.log('\n✅ PASS: All validations passed!')
    console.log(`   Email sent: ${response.sent}`)
    console.log(`   Message ID: ${response.messageId}`)
    console.log(`   Recipient: ${response.to}`)
    console.log(
      '\n🎉 Test passed - graph workflow with ref() completed successfully!\n'
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
