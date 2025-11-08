/**
 * Test script for workflow cancellation (PostgreSQL backend)
 * Should cancel immediately when value is negative
 */

const API_URL = 'http://localhost:4002'

async function main() {
  console.log('🧪 Testing Workflow Cancellation (PostgreSQL)\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Workflow detects negative value')
  console.log('  3. Workflow cancels itself with reason')
  console.log('  4. Workflow status becomes "cancelled"')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting unhappyRetry workflow with negative value...\n')

    const res = await fetch(`${API_URL}/workflow/test/unhappy-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: -5 }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`HTTP ${res.status}: ${errorText}`)
    }

    const response = await res.json()

    console.log('\n' + '='.repeat(70))
    console.log('\n❌ UNEXPECTED: Workflow should have been cancelled')
    console.log('\n📊 Response:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))
    process.exit(1)
  } catch (error: any) {
    console.log('\n' + '='.repeat(70))
    console.log('\n✅ EXPECTED: Workflow was cancelled')
    console.log('\n📊 Error details:')
    console.log(`  Message: ${error.message}`)

    // Check if error message indicates cancellation
    if (
      error.message.includes('cancelled') ||
      error.message.includes('negative')
    ) {
      console.log('\n✅ PASS: Workflow was successfully cancelled')
      console.log(
        '\n🎉 Test passed - workflow correctly handled cancellation!\n'
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
