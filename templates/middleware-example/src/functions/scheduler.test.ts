import { runScheduledTask } from '@pikku/core'
import { assertMiddleware } from '../utils/assert-middleware.js'
import type { ExpectedMiddleware } from '../utils/assert-middleware.js'

/**
 * Test scheduler task middleware execution
 */
export async function testSchedulerWiring(
  expected: ExpectedMiddleware[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run Scheduled Task')
  console.log('─────────────────────────')

  const passed = await assertMiddleware(
    expected,
    async () => {
      await runScheduledTask({
        name: 'testScheduledTask',
        singletonServices,
        createSessionServices,
      })
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(
      '\n✓ Scheduler middleware execution test completed successfully'
    )
  } else {
    console.log('\n✗ Scheduler middleware execution test failed')
  }

  return passed
}
