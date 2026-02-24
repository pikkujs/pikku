import { fetch } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test HTTP endpoint middleware and permission execution
 */
export async function testHTTPWiring(
  url: string,
  expected: ExpectedEvent[],
  singletonServices: any
): Promise<boolean> {
  console.log(`\n\nTest: ${url}`)
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await fetch(new Request(`http://localhost${url}`))
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
