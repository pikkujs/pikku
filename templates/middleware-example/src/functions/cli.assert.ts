import { runCLICommand } from '@pikku/core'
import { assertMiddleware } from '../utils/assert-middleware.js'
import type { ExpectedMiddleware } from '../utils/assert-middleware.js'

/**
 * Test CLI command middleware execution
 */
export async function testCLIWiring(
  expectedCommand: ExpectedMiddleware[],
  expectedSubcommand: ExpectedMiddleware[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run CLI Command')
  console.log('─────────────────────────')

  const commandPassed = await assertMiddleware(
    expectedCommand,
    async () => {
      await runCLICommand({
        program: 'test-cli',
        commandPath: ['command'],
        data: {},
        singletonServices,
        createSessionServices,
      })
    },
    singletonServices.logger
  )

  const subCommandPassed = await assertMiddleware(
    expectedSubcommand,
    async () => {
      await runCLICommand({
        program: 'test-cli',
        commandPath: ['command', 'subcommand'],
        data: {},
        singletonServices,
        createSessionServices,
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
