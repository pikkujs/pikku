import { runLocalChannel } from '@pikku/core/channel/local'
import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test Channel message middleware execution
 */
export async function testChannelWiring(
  route: string,
  command: string,
  data: any,
  expected: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log(`\n\nTest: ${route} - command: ${command}`)
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      const request = new PikkuFetchHTTPRequest(
        new Request(`http://localhost${route}`, {
          method: 'GET',
        })
      )
      const response = new PikkuFetchHTTPResponse()

      const channelHandler = await runLocalChannel({
        channelId: crypto.randomUUID(),
        request,
        response,
        route,
        singletonServices,
        createWireServices,
      })

      if (!channelHandler) {
        throw new Error('Channel handler not created')
      }

      // Register send callback to handle outgoing messages
      channelHandler.registerOnSend((message) => {
        // In tests, we can just log or ignore the sent messages
        // singletonServices.logger.info('Channel sent:', message)
      })

      // Open the channel
      channelHandler.open()

      // Send a message
      await channelHandler.message(
        JSON.stringify({
          command,
          ...data,
        })
      )

      // Close the channel
      channelHandler.close()
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(
      `\n✓ Channel test for ${route} - ${command} completed successfully`
    )
  } else {
    console.log(`\n✗ Channel test for ${route} - ${command} failed`)
  }

  return passed
}
