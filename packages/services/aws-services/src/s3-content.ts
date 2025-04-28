import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner'
import { ContentService, Logger } from '@pikku/core/services'
import { readFile } from 'fs/promises'
import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import { Readable } from 'stream'

export interface S3ContentConfig {
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

  public async signURL(
    url: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ) {
    try {
      return getSignedUrl({
        ...this.signConfig,
        url,
        dateLessThan: dateLessThan.toString(),
        dateGreaterThan: dateGreaterThan?.toString(),
      })
    } catch {
      this.logger.error(`Error signing url: ${url}`)
      return url
    }
  }

  public async signContentKey(
    key: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ) {
    return this.signURL(
      `https://${this.config.bucketName}/${key}`,
      dateLessThan,
      dateGreaterThan
    )
  }

  public async getUploadURL(Key: string, ContentType: string) {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key,
      ContentType,
    })
    return {
      uploadUrl: await getS3SignedUrl(this.s3, command, {
        expiresIn: 3600,
      }),
      assetKey: Key,
    }
  }

  public async readFile(Key: string): Promise<Readable> {
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

    return response.Body as Readable
  }

  public async writeFile(Key: string, stream: Readable): Promise<boolean> {
    try {
      this.logger.debug(`Writing file, key: ${Key}`)

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key,
          Body: stream, // <- Pass the readable stream directly
        })
      )

      return true
    } catch (e: any) {
      this.logger.error(`Error writing file, key: ${Key}`, e)
      return false
    }
  }

  public async copyFile(Key: string, fromAbsolutePath: string) {
    try {
      this.logger.debug(`Uploading file, key: ${Key} from: ${fromAbsolutePath}`)

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key,
          Body: await readFile(fromAbsolutePath),
        })
      )
      return true
    } catch (e: any) {
      this.logger.error(`Error writing file, key: ${Key}`, e)
      return false
    }
  }

  public async deleteFile(Key: string) {
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
