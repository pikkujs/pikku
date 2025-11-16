/**
 * Test script for Organization Onboarding Simple Workflow
 * Tests the simple workflow DSL with conditional logic and parallel execution
 */

import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

async function main() {
  console.log('🧪 Testing Organization Onboarding Simple Workflow\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Creates organization')
  console.log('  3. Creates owner (for enterprise plan)')
  console.log('  4. Invites members in parallel')
  console.log('  5. Sends welcome email')
  console.log('  6. Workflow completes successfully')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting organization onboarding workflow...\n')

    const response = await pikkuFetch.post('/workflow/simple/org-onboarding', {
      email: 'owner@company.com',
      name: 'Acme Corporation',
      plan: 'enterprise',
      memberEmails: [
        'alice@company.com',
        'bob@company.com',
        'charlie@company.com',
      ],
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Result:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    // Verify the response structure
    if (!response.orgId || !response.ownerId) {
      console.log('\n❌ FAIL: Missing expected fields in response')
      console.log('Expected: { orgId, ownerId }')
      console.log('Got:', response)
      process.exit(1)
    }

    console.log('\n✅ PASS: All validations passed!')
    console.log(`   Organization ID: ${response.orgId}`)
    console.log(`   Owner ID: ${response.ownerId}`)
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
