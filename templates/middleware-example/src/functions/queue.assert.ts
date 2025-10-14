import { runQueueJob } from '@pikku/core'
import { assertMiddleware } from '../utils/assert-middleware.js'
import type { ExpectedMiddleware } from '../utils/assert-middleware.js'

/**
 * Test queue worker middleware execution
 */
export async function testQueueWiring(
  expected: ExpectedMiddleware[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run Queue Job')
  console.log('─────────────────────────')

  const passed = await assertMiddleware(
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
