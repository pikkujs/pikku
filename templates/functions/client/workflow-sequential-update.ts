/**
 * Test script for Sequential Invite Simple Workflow
 * Tests the simple workflow DSL with sequential execution and delays
 */

import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

async function main() {
  console.log('🧪 Testing Sequential Invite Simple Workflow\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Invites members sequentially (one at a time)')
  console.log('  3. Waits specified delay between each invitation')
  console.log('  4. Workflow completes with invite count')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting sequential invite workflow...\n')

    const response = await pikkuFetch.post(
      '/workflow/simple/sequential-invite',
      {
        orgId: 'org-123',
        memberEmails: [
          'alice@company.com',
          'bob@company.com',
          'charlie@company.com',
          'diana@company.com',
        ],
        delayMs: 1000, // 1 second delay between invitations
      }
    )

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Result:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Verify the response structure
    if (response.invitedCount === undefined || !response.runId) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { invitedCount, runId }')
      console.log('Got:', response)
      process.exit(1)
    }

    // Verify the invite count matches the number of emails
    if (response.invitedCount !== 4) {
      console.log(
        `\n❌ FAIL: Expected invitedCount to be 4, got ${response.invitedCount}`
      )
      process.exit(1)
    }

    console.log('\n✅ PASS: All validations passed!')
    console.log(`   Invited Count: ${response.invitedCount}`)
    console.log(`   Run ID: ${response.runId}`)
    console.log('\n🎉 Test passed - workflow completed successfully!\n')
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
