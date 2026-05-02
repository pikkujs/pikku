import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner'
import type {
  BucketKeyArgs,
  ContentService,
  CopyFileArgs,
  GetUploadURLArgs,
  Logger,
  SignContentKeyArgs,
  SignURLArgs,
  UploadURLResult,
  WriteFileArgs,
} from '@pikku/core/services'
import { readFile } from 'fs/promises'
import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import type { Readable } from 'stream'

export interface S3ContentConfig {
  /**
   * The underlying S3 bucket. Logical (pseudo) buckets passed via the
   * ContentService API are stored as path prefixes within this bucket.
   */
  bucketName: string
  region: string
  endpoint?: string
}

export class S3Content implements ContentService {
  private s3: S3Client

  constructor(
    private config: S3ContentConfig,
    private logger: Logger,
    private signConfig: { keyPairId: string; privateKey: string }
  ) {
    this.s3 = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
    })
  }

  private join(bucket: string, key: string): string {
    return `${bucket}/${key}`
  }

  public async signURL(args: SignURLArgs) {
    try {
      return getSignedUrl({
        ...this.signConfig,
        url: args.url,
        dateLessThan: args.dateLessThan.toString(),
        dateGreaterThan: args.dateGreaterThan?.toString(),
      })
    } catch {
      this.logger.error(`Error signing url: ${args.url}`)
      return args.url
    }
  }

  public async signContentKey(args: SignContentKeyArgs) {
    return this.signURL({
      url: `https://${this.config.bucketName}/${this.join(args.bucket, args.contentKey)}`,
      dateLessThan: args.dateLessThan,
      dateGreaterThan: args.dateGreaterThan,
    })
  }

  public async getUploadURL(args: GetUploadURLArgs): Promise<UploadURLResult> {
    const Key = this.join(args.bucket, args.fileKey)
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key,
      ContentType: args.contentType,
    })
    return {
      uploadUrl: await getS3SignedUrl(this.s3, command, {
        expiresIn: 3600,
      }),
      assetKey: Key,
    }
  }

  public async readFile(
    args: BucketKeyArgs
  ): Promise<ReadableStream | NodeJS.ReadableStream> {
    const Key = this.join(args.bucket, args.key)
    this.logger.debug(`Getting file, key: ${Key}`)

    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key,
      })
    )

    if (!response.Body) {
      throw new Error('No body returned from S3')
    }

    return response.Body as NodeJS.ReadableStream
  }

  public async writeFile(args: WriteFileArgs): Promise<boolean> {
    const Key = this.join(args.bucket, args.key)
    try {
      this.logger.debug(`Writing file, key: ${Key}`)

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key,
          Body: args.stream as Readable,
        })
      )

      return true
    } catch (e: any) {
      this.logger.error(`Error writing file, key: ${Key}`, e)
      return false
    }
  }

  public async copyFile(args: CopyFileArgs) {
    const Key = this.join(args.bucket, args.key)
    try {
      this.logger.debug(
        `Uploading file, key: ${Key} from: ${args.fromAbsolutePath}`
      )

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key,
          Body: await readFile(args.fromAbsolutePath),
        })
      )
      return true
    } catch (e: any) {
      this.logger.error(`Error writing file, key: ${Key}`, e)
      return false
    }
  }

  public async readFileAsBuffer(args: BucketKeyArgs): Promise<Buffer> {
    const Key = this.join(args.bucket, args.key)
    this.logger.debug(`Getting file as buffer, key: ${Key}`)

    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key,
      })
    )

    if (!response.Body) {
      throw new Error('No body returned from S3')
    }

    return Buffer.from(await response.Body.transformToByteArray())
  }

  public async deleteFile(args: BucketKeyArgs) {
    const Key = this.join(args.bucket, args.key)
    try {
      this.logger.debug(`Deleting file, key: ${Key}`)
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucketName,
          Key,
        })
      )
      return true
    } catch (e: any) {
      this.logger.error(`Error deleting file, key: ${Key}`, e)
      return false
    }
  }
}
