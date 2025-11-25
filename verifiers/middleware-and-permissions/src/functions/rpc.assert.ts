import { runPikkuFunc } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test internal RPC middleware and permission execution
 */
export async function testInternalRPCWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log('\n\nTest: Internal RPC with External Package Call')
  console.log('──────────────────────────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runPikkuFunc(
        'rpc',
        'testExternalWithAuth',
        'testExternalWithAuth',
        {
          singletonServices,
          createWireServices,
          data: () => ({ value: 'test' }),
          wire: {},
        }
      )
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(
      '\n✓ Internal RPC middleware execution test completed successfully'
    )
  } else {
    console.log('\n✗ Internal RPC middleware execution test failed')
  }

  return passed
}
