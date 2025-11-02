import {
  runChannelConnect,
  runChannelMessage,
  runChannelDisconnect,
} from '@pikku/core/channel/serverless'
import { ChannelStore, type Channel } from '@pikku/core/channel'
import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Simple in-memory channel store for testing
 */
class TestChannelStore extends ChannelStore {
  private channels = new Map<string, Channel & { session: any }>()

  async addChannel(channel: Channel): Promise<void> {
    this.channels.set(channel.channelId, { ...channel, session: null })
  }

  async removeChannels(channelIds: string[]): Promise<void> {
    for (const id of channelIds) {
      this.channels.delete(id)
    }
  }

  async setUserSession(channelId: string, userSession: any): Promise<void> {
    const channel = this.channels.get(channelId)
    if (channel) {
      channel.session = userSession
    }
  }

  async getChannelAndSession(
    channelId: string
  ): Promise<Channel & { session: any }> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`)
    }
    return channel
  }
}

/**
 * Test Channel message middleware execution using serverless runner
 */
export async function testChannelWiringServerless(
  route: string,
  command: string,
  data: any,
  expected: ExpectedEvent[],
  singletonServices: any,
  createSessionServices: any
): Promise<boolean> {
  console.log(`\n\nTest (Serverless): ${route} - command: ${command}`)
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      const channelId = crypto.randomUUID()
      const channelStore = new TestChannelStore()

      // Create a channel handler factory
      const channelHandlerFactory = (
        id: string,
        name: string,
        openingData?: unknown
      ) => {
        let sendCallback: ((message: any) => void) | undefined

        const channel = {
          channelId: id,
          name,
          openingData,
          state: 'open' as const,
          send: (message: any) => {
            if (sendCallback) {
              sendCallback(message)
            }
          },
          close: () => {
            // no-op for tests
          },
        }

        return {
          send: (message: any) => {
            if (sendCallback) {
              sendCallback(message)
            }
          },
          getChannel: () => channel,
          registerOnSend: (callback: (message: any) => void) => {
            sendCallback = callback
          },
        }
      }

      const request = new PikkuFetchHTTPRequest(
        new Request(`http://localhost${route}`, { method: 'GET' })
      )
      const response = new PikkuFetchHTTPResponse()

      // Connect
      await runChannelConnect({
        channelId,
        route,
        request,
        response,
        singletonServices,
        createSessionServices,
        channelStore,
        channelHandlerFactory,
      })

      // Send message
      await runChannelMessage(
        {
          channelId,
          singletonServices,
          createSessionServices,
          channelStore,
          channelHandlerFactory,
        },
        JSON.stringify({
          command,
          ...data,
        })
      )

      // Disconnect
      await runChannelDisconnect({
        channelId,
        singletonServices,
        createSessionServices,
        channelStore,
        channelHandlerFactory,
      })
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(
      `\n✓ Channel test (Serverless) for ${route} - ${command} completed successfully`
    )
  } else {
    console.log(
      `\n✗ Channel test (Serverless) for ${route} - ${command} failed`
    )
  }

  return passed
}
