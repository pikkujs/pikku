import type { EventHubDeliveryBackend } from './event-hub.types.js'

/**
 * Delivers to channels in this process by calling `send` on each. A channel
 * whose `send` throws is reported back and detached, which is how a client
 * that left without saying so is noticed.
 */
export const createLocalDeliveryBackend = (): EventHubDeliveryBackend => ({
  name: 'local',
  transport: 'local',
  deliver: async (message, channels) => {
    const failed: string[] = []
    const payload = message.isBinary ? message.data : message.serialized()
    for (const channel of channels) {
      try {
        await channel.send(payload, message.isBinary)
      } catch {
        failed.push(channel.getChannel().channelId)
      }
    }
    return failed
  },
})
