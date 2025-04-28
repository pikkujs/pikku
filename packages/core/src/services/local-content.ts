import { promises } from 'fs'
import { mkdir } from 'fs/promises'
import { ContentService, Logger } from '@pikku/core/services'

export interface LocalContentConfig {
  localFileUploadPath: string
  uploadUrlPrefix: string
  assetUrlPrefix: string
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
    return `${this.config.assetUrlPrefix}/${assetKey}?signed=true`
  }

  public async getUploadURL(assetKey: string) {
    this.logger.debug(`Going to upload with key: ${assetKey}`)
    return {
      uploadUrl: `${this.config.uploadUrlPrefix}/${assetKey}`,
      assetKey,
    }
  }

  public async writeFile(assetKey: string, buffer: Buffer): Promise<boolean> {
    this.logger.debug(`Writing file: ${assetKey}`)
    try {
      const path = `${this.config.localFileUploadPath}/${assetKey}`
      await this.createDirectoryForFile(path)
      await promises.writeFile(path, buffer)
    } catch (e) {
      console.error(e)
      this.logger.error(`Error inserting content ${assetKey}`, e)
    }
    return false
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

  public async readFile(assetKey: string): Promise<Buffer> {
    this.logger.debug(`getting key: ${assetKey}`)
    try {
      return await promises.readFile(
        `${this.config.localFileUploadPath}/${assetKey}`
      )
    } catch (e) {
      this.logger.error(`Error get content ${assetKey}`)
      throw e
    }
  }

  public async deleteFile(assetKey: string): Promise<boolean> {
    this.logger.debug(`deleting key: ${assetKey}`)
    try {
      await promises.unlink(`${this.config.localFileUploadPath}/${assetKey}`)
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
