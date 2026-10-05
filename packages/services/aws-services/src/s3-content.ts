import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner'
import type {
  BucketKeyArgs,
  ContentService,
  ContentVisibility,
  CopyFileArgs,
  GetDownloadURLArgs,
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
  /**
   * Where public objects are served from. Public visibility is a per-object
   * `public-read` ACL, so the bucket must allow ACLs. Defaults to
   * `https://<bucketName>`.
   */
  publicBaseUrl?: string
}

const PUBLIC_ACL = 'public-read'

const isAclRefused = (e: any): boolean =>
  e?.name === 'AccessControlListNotSupported' ||
  e?.Code === 'AccessControlListNotSupported'

const aclRefusedError = (bucketName: string): Error =>
  new Error(
    `S3 bucket '${bucketName}' does not allow ACLs, so public content cannot be stored in it. Enable ACLs by setting Object Ownership to 'Bucket owner preferred' and allowing public ACLs in Block Public Access, or use a bucket that serves public content.`
  )

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

  private publicURL(bucket: string, key: string): string {
    const base =
      this.config.publicBaseUrl ?? `https://${this.config.bucketName}`
    return `${base.replace(/\/+$/, '')}/${this.join(bucket, key)}`
  }

  private acl(visibility?: ContentVisibility) {
    return visibility === 'public' ? { ACL: PUBLIC_ACL as 'public-read' } : {}
  }

  public async signContentKey(args: SignContentKeyArgs) {
    if (args.visibility === 'public') {
      return this.publicURL(args.bucket, args.contentKey)
    }
    return this.signURL({
      url: `https://${this.config.bucketName}/${this.join(args.bucket, args.contentKey)}`,
      dateLessThan: args.dateLessThan,
      dateGreaterThan: args.dateGreaterThan,
    })
  }

  public async getUploadURL(args: GetUploadURLArgs): Promise<UploadURLResult> {
    const Key = this.join(args.bucket, args.fileKey)
    const isPublic = args.visibility === 'public'
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key,
      ContentType: args.contentType,
      ...this.acl(args.visibility),
    })
    const uploadUrl = await getS3SignedUrl(this.s3, command, {
      expiresIn: 3600,
      ...(isPublic
        ? {
            unhoistableHeaders: new Set(['x-amz-acl']),
            signableHeaders: new Set(['x-amz-acl']),
          }
        : {}),
    })
    return {
      uploadUrl,
      assetKey: Key,
      ...(isPublic ? { uploadHeaders: { 'x-amz-acl': PUBLIC_ACL } } : {}),
    }
  }

  public async getDownloadURL(args: GetDownloadURLArgs): Promise<string> {
    return this.signContentKey({
      bucket: args.bucket,
      contentKey: args.key,
      visibility: args.visibility,
      dateLessThan: new Date(
        Date.now() + (args.expiresInSeconds ?? 3600) * 1000
      ),
    })
  }

  public async listFilesByPrefix(
    bucket: string,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<string[]> {
    void visibility
    const root = `${bucket}/`
    const keys: string[] = []
    let ContinuationToken: string | undefined
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: `${root}${prefix}`,
          ContinuationToken,
        })
      )
      for (const item of page.Contents ?? []) {
        if (item.Key) keys.push(item.Key.slice(root.length))
      }
      ContinuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined
    } while (ContinuationToken)
    return keys
  }

  public async deleteByPrefix(
    bucket: string,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<number> {
    const keys = await this.listFilesByPrefix(bucket, prefix, visibility)
    for (let i = 0; i < keys.length; i += 1000) {
      await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucketName,
          Delete: {
            Objects: keys
              .slice(i, i + 1000)
              .map((key) => ({ Key: this.join(bucket, key) })),
            Quiet: true,
          },
        })
      )
    }
    return keys.length
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
          ...this.acl(args.visibility),
        })
      )

      return true
    } catch (e: any) {
      if (isAclRefused(e)) throw aclRefusedError(this.config.bucketName)
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
          ...this.acl(args.visibility),
        })
      )
      return true
    } catch (e: any) {
      if (isAclRefused(e)) throw aclRefusedError(this.config.bucketName)
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
