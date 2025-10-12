import { runCLICommand } from '@pikku/core'
import { assertMiddleware } from '../utils/assert-middleware.js'
import type { ExpectedMiddleware } from '../utils/assert-middleware.js'

/**
 * Test CLI command middleware execution
 */
export async function testCLIWiring(
  expected: ExpectedMiddleware[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run CLI Command')
  console.log('─────────────────────────')

  const passed = await assertMiddleware(
    expected,
    async () => {
      await runCLICommand({
        program: 'test-cli',
        commandPath: ['greet'],
        data: { name: 'World' },
        singletonServices,
        createSessionServices,
      })
    },
    singletonServices.logger
  )

  if (passed) {
    console.log('\n✓ CLI middleware execution test completed successfully')
  } else {
    console.log('\n✗ CLI middleware execution test failed')
  }

  return passed
}
