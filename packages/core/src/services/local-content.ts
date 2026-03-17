import { createReadStream, createWriteStream, promises } from 'fs'
import { mkdir, readFile } from 'fs/promises'
import { resolve, normalize } from 'path'
import type { ContentService, JWTService, Logger } from '@pikku/core/services'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'

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
    private logger: Logger,
    private jwt?: JWTService
  ) {}

  private safePath(assetKey: string): string {
    const base = resolve(this.config.localFileUploadPath)
    const target = resolve(base, normalize(assetKey))
    if (!target.startsWith(base + '/') && target !== base) {
      throw new Error('Invalid asset key')
    }
    return target
  }

  public async init() {}

  private async signParams(
    dateLessThan: Date,
    dateGreaterThan?: Date
  ): Promise<string> {
    const signedAt = Date.now()
    const expiresAt = dateLessThan.getTime()
    const params = new URLSearchParams({
      signedAt: String(signedAt),
      expiresAt: String(expiresAt),
    })
    if (dateGreaterThan) {
      params.set('notBefore', String(dateGreaterThan.getTime()))
    }
    if (this.jwt) {
      const expiresInSeconds = Math.max(
        1,
        Math.floor((expiresAt - signedAt) / 1000)
      )
      const signature = await this.jwt.encode(
        { value: expiresInSeconds, unit: 'second' },
        { signedAt, expiresAt }
      )
      params.set('signature', signature)
    }
    return params.toString()
  }

  public async signURL(
    url: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ): Promise<string> {
    const params = await this.signParams(dateLessThan, dateGreaterThan)
    return `${url}?${params}`
  }

  public async signContentKey(
    assetKey: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ): Promise<string> {
    const base = this.config.server
      ? `${this.config.server}${this.config.assetUrlPrefix}/${assetKey}`
      : `${this.config.assetUrlPrefix}/${assetKey}`
    return this.signURL(base, dateLessThan, dateGreaterThan)
  }

  public async getUploadURL(assetKey: string) {
    this.logger.debug(`Going to upload with key: ${assetKey}`)
    return {
      uploadUrl: `${this.config.uploadUrlPrefix}/${assetKey}`,
      assetKey,
    }
  }

  public async writeFile(
    assetKey: string,
    stream: ReadableStream | NodeJS.ReadableStream
  ): Promise<boolean> {
    this.logger.debug(`Writing file: ${assetKey}`)

    const path = this.safePath(assetKey)

    try {
      await this.createDirectoryForFile(path)
      const fileStream = createWriteStream(path)
      // Use pipeline to properly manage stream piping and errors
      await pipeline(stream as Readable, fileStream)
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
      const path = this.safePath(assetKey)
      await this.createDirectoryForFile(path)
      await promises.copyFile(fromAbsolutePath, path)
    } catch (e) {
      console.error(e)
      this.logger.error(`Error inserting content ${assetKey}`, e)
    }
    return false
  }

  public async readFile(
    assetKey: string
  ): Promise<ReadableStream | NodeJS.ReadableStream> {
    this.logger.debug(`Getting key: ${assetKey}`)

    const filePath = this.safePath(assetKey)

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

  public async readFileAsBuffer(assetKey: string): Promise<Buffer> {
    const filePath = this.safePath(assetKey)
    this.logger.debug(`Reading file as buffer: ${assetKey}`)
    return readFile(filePath)
  }

  public async deleteFile(assetKey: string): Promise<boolean> {
    this.logger.debug(`deleting key: ${assetKey}`)
    try {
      await promises.unlink(this.safePath(assetKey))
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
