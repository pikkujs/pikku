import { fetch } from '@pikku/core'
import { assertMiddleware } from '../utils/assert-middleware.js'
import type { ExpectedMiddleware } from '../utils/assert-middleware.js'

/**
 * Test HTTP endpoint middleware execution
 */
export async function testHTTPWiring(
  url: string,
  expected: ExpectedMiddleware[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log(`\n\nTest: GET ${url}`)
  console.log('─────────────────────────')

  const passed = await assertMiddleware(
    expected,
    async () => {
      await fetch(new Request(`http://localhost${url}`), {
        singletonServices,
        createSessionServices,
        skipUserSession: true,
      })
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(`\n✓ HTTP test for ${url} completed successfully`)
  } else {
    console.log(`\n✗ HTTP test for ${url} failed`)
  }

  return passed
}
