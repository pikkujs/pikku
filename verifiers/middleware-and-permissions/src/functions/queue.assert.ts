import { runQueueJob } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test queue worker middleware execution
 */
export async function testQueueWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run Queue Job')
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runQueueJob({
        singletonServices,
        createSessionServices,
        job: {
          id: 'test-job-1',
          queueName: 'test-queue',
          data: {},
          status: () => 'active' as const,
          metadata: () => ({
            attemptsMade: 0,
            maxAttempts: 3,
            createdAt: new Date(),
          }),
        },
      })
    },
    singletonServices.logger
  )

  if (passed) {
    console.log('\n✓ Queue middleware execution test completed successfully')
  } else {
    console.log('\n✗ Queue middleware execution test failed')
  }

  return passed
}
