import { createReadStream, createWriteStream, promises, ReadStream } from 'fs'
import { mkdir } from 'fs/promises'
import { ContentService, Logger } from '@pikku/core/services'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

export interface LocalContentConfig {
  localFileUploadPath: string
  uploadUrlPrefix: string
  assetUrlPrefix: string
  server?: string
  sizeLimit?: string
}

export class LocalContent implements ContentService {
  constructor(
    private config: LocalContentConfig,
    private logger: Logger
  ) {}

  public async init() {}

  public async signURL(url: string): Promise<string> {
    return `${url}?signed=true`
  }

  public async signContentKey(assetKey: string): Promise<string> {
    return this.config.server
      ? `${this.config.server}${this.config.assetUrlPrefix}/${assetKey}?signed=true`
      : `${this.config.assetUrlPrefix}/${assetKey}?signed=true`
  }

  public async getUploadURL(assetKey: string) {
    this.logger.debug(`Going to upload with key: ${assetKey}`)
    return {
      uploadUrl: `${this.config.uploadUrlPrefix}/${assetKey}`,
      assetKey,
    }
  }

  public async writeFile(assetKey: string, stream: Readable): Promise<boolean> {
    this.logger.debug(`Writing file: ${assetKey}`)

    const path = `${this.config.localFileUploadPath}/${assetKey}`

    try {
      await this.createDirectoryForFile(path)
      const fileStream = createWriteStream(path)
      // Use pipeline to properly manage stream piping and errors
      await pipeline(stream, fileStream)
      return true
    } catch (e) {
      console.error(e)
      this.logger.error(`Error writing content ${assetKey}`, e)
      return false
    }
  }

  public async copyFile(
    assetKey: string,
    fromAbsolutePath: string
  ): Promise<boolean> {
    this.logger.debug(`Writing file: ${assetKey}`)
    try {
      const path = `${this.config.localFileUploadPath}/${assetKey}`
      await this.createDirectoryForFile(path)
      await promises.copyFile(fromAbsolutePath, path)
    } catch (e) {
      console.error(e)
      this.logger.error(`Error inserting content ${assetKey}`, e)
    }
    return false
  }

  public async readFile(assetKey: string): Promise<ReadStream> {
    this.logger.debug(`Getting key: ${assetKey}`)

    const filePath = `${this.config.localFileUploadPath}/${assetKey}`

    try {
      const stream = createReadStream(filePath)
      // Handle early stream errors (like file not found, permission denied, etc.)
      stream.on('error', (err) => {
        this.logger.error(`Error getting content ${assetKey}`, err)
      })

      return stream
    } catch (e) {
      this.logger.error(`Error setting up stream for ${assetKey}`, e)
      throw e
    }
  }

  public async deleteFile(assetKey: string): Promise<boolean> {
    this.logger.debug(`deleting key: ${assetKey}`)
    try {
      await promises.unlink(`${this.config.localFileUploadPath}/${assetKey}`)
      return true
    } catch (e: any) {
      this.logger.error(`Error deleting content ${assetKey}`, e)
    }
    return false
  }

  private async createDirectoryForFile(path: string): Promise<void> {
    const dir = path.split('/').slice(0, -1).join('/')
    await mkdir(dir, { recursive: true })
  }
}
