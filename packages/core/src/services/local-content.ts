import { createReadStream, createWriteStream, promises } from 'fs'
import { mkdir, readFile } from 'fs/promises'
import { resolve, normalize } from 'path'
import type {
  BucketKeyArgs,
  ContentService,
  CopyFileArgs,
  GetUploadURLArgs,
  JWTService,
  Logger,
  SignContentKeyArgs,
  SignURLArgs,
  UploadURLResult,
  WriteFileArgs,
} from '@pikku/core/services'
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

  private safePath(bucket: string, key: string): string {
    const base = resolve(this.config.localFileUploadPath)
    const scoped = resolve(base, normalize(bucket))
    const target = resolve(scoped, normalize(key))
    if (!target.startsWith(base + '/') && target !== base) {
      throw new Error('Invalid asset key')
    }
    return target
  }

  private joinKey(bucket: string, key: string): string {
    return `${bucket}/${key}`
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

  public async signURL(args: SignURLArgs): Promise<string> {
    const params = await this.signParams(
      args.dateLessThan,
      args.dateGreaterThan
    )
    return `${args.url}?${params}`
  }

  public async signContentKey(args: SignContentKeyArgs): Promise<string> {
    const fullKey = this.joinKey(args.bucket, args.contentKey)
    const base = this.config.server
      ? `${this.config.server}${this.config.assetUrlPrefix}/${fullKey}`
      : `${this.config.assetUrlPrefix}/${fullKey}`
    return this.signURL({
      url: base,
      dateLessThan: args.dateLessThan,
      dateGreaterThan: args.dateGreaterThan,
    })
  }

  public async getUploadURL(args: GetUploadURLArgs): Promise<UploadURLResult> {
    const fullKey = this.joinKey(args.bucket, args.fileKey)
    this.logger.debug(`Going to upload with key: ${fullKey}`)
    return {
      uploadUrl: `${this.config.uploadUrlPrefix}/${fullKey}`,
      assetKey: fullKey,
    }
  }

  public async writeFile(args: WriteFileArgs): Promise<boolean> {
    this.logger.debug(`Writing file: ${args.bucket}/${args.key}`)

    const path = this.safePath(args.bucket, args.key)

    try {
      await this.createDirectoryForFile(path)
      const fileStream = createWriteStream(path)
      await pipeline(args.stream as Readable, fileStream)
      return true
    } catch (e) {
      console.error(e)
      this.logger.error(`Error writing content ${args.bucket}/${args.key}`, e)
      return false
    }
  }

  public async copyFile(args: CopyFileArgs): Promise<boolean> {
    this.logger.debug(`Writing file: ${args.bucket}/${args.key}`)
    try {
      const path = this.safePath(args.bucket, args.key)
      await this.createDirectoryForFile(path)
      await promises.copyFile(args.fromAbsolutePath, path)
      return true
    } catch (e) {
      console.error(e)
      this.logger.error(`Error inserting content ${args.bucket}/${args.key}`, e)
    }
    return false
  }

  public async readFile(
    args: BucketKeyArgs
  ): Promise<ReadableStream | NodeJS.ReadableStream> {
    this.logger.debug(`Getting key: ${args.bucket}/${args.key}`)

    const filePath = this.safePath(args.bucket, args.key)

    try {
      const stream = createReadStream(filePath)
      stream.on('error', (err) => {
        this.logger.error(
          `Error getting content ${args.bucket}/${args.key}`,
          err
        )
      })

      return stream
    } catch (e) {
      this.logger.error(
        `Error setting up stream for ${args.bucket}/${args.key}`,
        e
      )
      throw e
    }
  }

  public async readFileAsBuffer(args: BucketKeyArgs): Promise<Buffer> {
    const filePath = this.safePath(args.bucket, args.key)
    this.logger.debug(`Reading file as buffer: ${args.bucket}/${args.key}`)
    return readFile(filePath)
  }

  public async deleteFile(args: BucketKeyArgs): Promise<boolean> {
    this.logger.debug(`deleting key: ${args.bucket}/${args.key}`)
    try {
      await promises.unlink(this.safePath(args.bucket, args.key))
      return true
    } catch (e: any) {
      this.logger.error(`Error deleting content ${args.bucket}/${args.key}`, e)
    }
    return false
  }

  private async createDirectoryForFile(path: string): Promise<void> {
    const dir = path.split('/').slice(0, -1).join('/')
    await mkdir(dir, { recursive: true })
  }
}
