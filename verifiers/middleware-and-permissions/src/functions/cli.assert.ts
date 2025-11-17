import { runCLICommand } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test CLI command middleware and permission execution
 */
export async function testCLIWiring(
  expectedCommand: ExpectedEvent[],
  expectedSubcommand: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run CLI Command')
  console.log('─────────────────────────')

  const commandPassed = await assertMiddlewareAndPermissions(
    expectedCommand,
    async () => {
      await runCLICommand({
        program: 'test-cli',
        commandPath: ['command'],
        data: {},
        singletonServices,
        createWireServices,
      })
    },
    singletonServices.logger
  )

  const subCommandPassed = await assertMiddlewareAndPermissions(
    expectedSubcommand,
    async () => {
      await runCLICommand({
        program: 'test-cli',
        commandPath: ['command', 'subcommand'],
        data: {},
        singletonServices,
        createWireServices,
      })
    },
    singletonServices.logger
  )

  if (commandPassed && subCommandPassed) {
    console.log('\n✓ CLI middleware execution test completed successfully')
  } else {
    console.log('\n✗ CLI middleware execution test failed')
  }

  return commandPassed && subCommandPassed
}
