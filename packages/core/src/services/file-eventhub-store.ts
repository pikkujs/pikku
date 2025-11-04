import { promises as fs } from 'fs'
import { join } from 'path'
import { EventHubStore } from '../wirings/channel/eventhub-store.js'

/**
 * File-based implementation of EventHubStore for serverless/multi-process environments.
 * Stores subscriptions as JSON files in a directory. Suitable for AWS Lambda /tmp storage
 * or other shared filesystem scenarios.
 */
export class FileEventHubStore<
  EventTopics extends Record<string, any> = {},
> extends EventHubStore<EventTopics> {
  private storageDir: string

  constructor(storageDir: string = '/tmp/pikku-eventhub') {
    super()
    this.storageDir = storageDir
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
    } catch (err) {
      // Directory might already exist, ignore error
    }
  }

  private getTopicPath(topic: string): string {
    // Sanitize topic name for filesystem
    const safeTopic = topic.replace(/[^a-zA-Z0-9-_]/g, '_')
    return join(this.storageDir, `${safeTopic}.json`)
  }

  private async readSubscriptions(topic: string): Promise<Set<string>> {
    try {
      const content = await fs.readFile(this.getTopicPath(topic), 'utf-8')
      const channelIds = JSON.parse(content) as string[]
      return new Set(channelIds)
    } catch (err) {
      return new Set()
    }
  }

  private async writeSubscriptions(
    topic: string,
    channelIds: Set<string>
  ): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      this.getTopicPath(topic),
      JSON.stringify(Array.from(channelIds))
    )
  }

  public async getChannelIdsForTopic(topic: string): Promise<string[]> {
    const channelIds = await this.readSubscriptions(topic)
    return Array.from(channelIds)
  }

  public async subscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<boolean> {
    const topicKey = topic as string
    const channelIds = await this.readSubscriptions(topicKey)
    channelIds.add(channelId)
    await this.writeSubscriptions(topicKey, channelIds)
    return true
  }

  public async unsubscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<boolean> {
    const topicKey = topic as string
    const channelIds = await this.readSubscriptions(topicKey)
    channelIds.delete(channelId)
    if (channelIds.size === 0) {
      // Remove the file if no subscriptions left
      try {
        await fs.unlink(this.getTopicPath(topicKey))
      } catch (err) {
        // File might not exist, ignore error
      }
    } else {
      await this.writeSubscriptions(topicKey, channelIds)
    }
    return true
  }
}
