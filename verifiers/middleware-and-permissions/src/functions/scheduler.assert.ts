import { runScheduledTask } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test scheduler task middleware and permission execution
 */
export async function testSchedulerWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run Scheduled Task')
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runScheduledTask({
        name: 'testScheduledTask',
        singletonServices,
        createWireServices,
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
