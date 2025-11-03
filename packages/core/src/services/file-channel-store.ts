import { promises as fs } from 'fs'
import { join } from 'path'
import { CoreUserSession } from '../types/core.types.js'
import { Channel, ChannelStore } from '../wirings/channel/channel-store.js'

/**
 * File-based implementation of ChannelStore for serverless/multi-process environments.
 * Stores channels as JSON files in a directory. Suitable for AWS Lambda /tmp storage
 * or other shared filesystem scenarios.
 */
export class FileChannelStore extends ChannelStore {
  private storageDir: string

  constructor(storageDir: string = '/tmp/pikku-channels') {
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

  private getChannelPath(channelId: string): string {
    return join(this.storageDir, `${channelId}.json`)
  }

  public async addChannel({
    channelId,
    channelName,
    channelObject,
    openingData,
  }: Channel): Promise<void> {
    await this.ensureDir()
    const data = {
      channelId,
      channelName,
      channelObject,
      openingData,
      session: null,
    }
    await fs.writeFile(this.getChannelPath(channelId), JSON.stringify(data))
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    await Promise.all(
      channelIds.map(async (channelId) => {
        try {
          await fs.unlink(this.getChannelPath(channelId))
        } catch (err) {
          // File might not exist, ignore error
        }
      })
    )
  }

  public async setUserSession(
    channelId: string,
    session: CoreUserSession | null
  ): Promise<void> {
    const channelPath = this.getChannelPath(channelId)
    try {
      const content = await fs.readFile(channelPath, 'utf-8')
      const channel = JSON.parse(content)
      channel.session = session
      await fs.writeFile(channelPath, JSON.stringify(channel))
    } catch (err) {
      throw new Error(`Channel ${channelId} not found`)
    }
  }

  public async getChannelAndSession(
    channelId: string
  ): Promise<Channel & { session: CoreUserSession }> {
    const channelPath = this.getChannelPath(channelId)
    try {
      const content = await fs.readFile(channelPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      throw new Error(`Channel ${channelId} not found`)
    }
  }
}
