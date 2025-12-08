/**
 * Example client for starting workflows via HTTP
 */
import { pikkuFetch } from './pikku-fetch.gen.js'

const API_URL = 'http://localhost:4002'
pikkuFetch.setServerUrl(API_URL)

async function main() {
  console.log('🧪 Testing Workflow Start (Onboarding)\n')
  console.log('='.repeat(70))
  console.log('\n📝 Expected behavior:')
  console.log('  1. Workflow starts')
  console.log('  2. Creates user profile')
  console.log('  3. Sleeps for 5 seconds')
  console.log('  4. Sends welcome email')
  console.log('  5. Workflow completes successfully')
  console.log('\n' + '='.repeat(70))

  try {
    console.log('\n📤 Starting onboarding workflow via HTTP...\n')

    const response = await pikkuFetch.post('/workflow/start', {
      email: 'user@example.com',
      userId: 'user-123',
    })

    console.log('\n' + '='.repeat(70))
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Response:')
    console.log(JSON.stringify(response, null, 2))
    console.log('\n' + '='.repeat(70))

    console.log('\n🎉 Test passed - workflow completed successfully!\n')
    process.exit(0)
  } catch (error: any) {
    console.log('\n' + '='.repeat(70))
    console.log('\n❌ UNEXPECTED: Request failed')
    console.log('\n📊 Error details:')
    console.log(`  Message: ${error.message}`)
    console.log('\n' + '='.repeat(70))
    process.exit(1)
  }
}

main()
