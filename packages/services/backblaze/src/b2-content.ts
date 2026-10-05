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
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'

const B2_AUTH_URL = 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account'

export interface B2ContentConfig {
  applicationKeyId: string
  applicationKey: string
  /**
   * The underlying B2 bucket. Logical (pseudo) buckets passed via the
   * ContentService API are stored as path prefixes within this bucket.
   */
  bucketId: string
  /**
   * A bucket set to public in Backblaze, used for public content. Without it,
   * public content is stored in `bucketId`, which then has to serve it.
   */
  publicBucketId?: string
}

interface B2Auth {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
}

export class B2Content implements ContentService {
  private bucketId: string
  private publicBucketId: string | undefined
  private bucketNames = new Map<string, string>()
  private auth: B2Auth | null = null
  private credentials: string

  constructor(
    config: B2ContentConfig,
    private logger: Logger
  ) {
    this.bucketId = config.bucketId
    this.publicBucketId = config.publicBucketId
    this.credentials = btoa(
      `${config.applicationKeyId}:${config.applicationKey}`
    )
  }

  private join(bucket: string, key: string): string {
    return `${bucket}/${key}`
  }

  private async ensureAuthorized(): Promise<B2Auth> {
    if (!this.auth) {
      const res = await fetch(B2_AUTH_URL, {
        method: 'GET',
        headers: { Authorization: `Basic ${this.credentials}` },
      })
      if (!res.ok) {
        throw new Error(`B2 authorization failed: ${res.status}`)
      }
      this.auth = (await res.json()) as B2Auth
    }
    return this.auth
  }

  private async b2Post(endpoint: string, body: Record<string, unknown>) {
    const auth = await this.ensureAuthorized()
    const res = await fetch(`${auth.apiUrl}/b2api/v2/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`B2 ${endpoint} failed: ${res.status}`)
    }
    return res.json()
  }

  private bucketIdFor(visibility?: ContentVisibility): string {
    return visibility === 'public' && this.publicBucketId
      ? this.publicBucketId
      : this.bucketId
  }

  private isPublicBucket(visibility?: ContentVisibility): boolean {
    return visibility === 'public'
  }

  private async getBucketName(bucketId = this.bucketId): Promise<string> {
    let name = this.bucketNames.get(bucketId)
    if (!name) {
      const data = await this.b2Post('b2_list_buckets', {
        accountId: ((await this.ensureAuthorized()) as any).accountId,
        bucketId,
      })
      name = data.buckets[0].bucketName as string
      this.bucketNames.set(bucketId, name)
    }
    return name
  }

  private async getUploadToken(bucketId = this.bucketId): Promise<{
    uploadUrl: string
    authorizationToken: string
  }> {
    return await this.b2Post('b2_get_upload_url', { bucketId })
  }

  private async uploadData(
    fileName: string,
    data: Buffer | Uint8Array,
    contentType = 'application/octet-stream',
    bucketId = this.bucketId
  ) {
    const { uploadUrl, authorizationToken } =
      await this.getUploadToken(bucketId)
    const sha1 = createHash('sha1').update(data).digest('hex')
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': contentType,
        'Content-Length': String(data.byteLength),
        'X-Bz-Content-Sha1': sha1,
      },
      body: data as unknown as BodyInit,
    })
    if (!res.ok) {
      throw new Error(`B2 upload failed: ${res.status}`)
    }
    return res.json()
  }

  private async getDownloadAuthorization(
    fileNamePrefix: string,
    validDurationInSeconds: number,
    bucketId = this.bucketId
  ): Promise<string> {
    const data = await this.b2Post('b2_get_download_authorization', {
      bucketId,
      fileNamePrefix,
      validDurationInSeconds,
    })
    return data.authorizationToken
  }

  async signContentKey(args: SignContentKeyArgs): Promise<string> {
    const fullKey = this.join(args.bucket, args.contentKey)
    const auth = await this.ensureAuthorized()
    const bucketId = this.bucketIdFor(args.visibility)
    const bucketName = await this.getBucketName(bucketId)
    if (this.isPublicBucket(args.visibility) && this.publicBucketId) {
      return `${auth.downloadUrl}/file/${bucketName}/${fullKey}`
    }
    const durationSeconds = Math.max(
      1,
      Math.floor((args.dateLessThan.getTime() - Date.now()) / 1000)
    )
    const downloadAuth = await this.getDownloadAuthorization(
      fullKey,
      durationSeconds,
      bucketId
    )
    return `${auth.downloadUrl}/file/${bucketName}/${fullKey}?Authorization=${downloadAuth}`
  }

  async getDownloadURL(args: GetDownloadURLArgs): Promise<string> {
    return this.signContentKey({
      bucket: args.bucket,
      contentKey: args.key,
      visibility: args.visibility,
      dateLessThan: new Date(
        Date.now() + (args.expiresInSeconds ?? 3600) * 1000
      ),
    })
  }

  async signURL(args: SignURLArgs): Promise<string> {
    const durationSeconds = Math.max(
      1,
      Math.floor((args.dateLessThan.getTime() - Date.now()) / 1000)
    )
    const parsed = new URL(args.url)
    const pathParts = parsed.pathname.split('/file/')
    if (pathParts.length < 2) {
      return args.url
    }
    const filePrefix = pathParts[1]!.split('/').slice(1).join('/')
    const downloadAuth = await this.getDownloadAuthorization(
      filePrefix,
      durationSeconds
    )
    parsed.searchParams.set('Authorization', downloadAuth)
    return parsed.toString()
  }

  async getUploadURL(args: GetUploadURLArgs): Promise<UploadURLResult> {
    const fullKey = this.join(args.bucket, args.fileKey)
    const { uploadUrl, authorizationToken } = await this.getUploadToken(
      this.bucketIdFor(args.visibility)
    )
    return {
      uploadUrl,
      assetKey: fullKey,
      uploadMethod: 'POST',
      uploadHeaders: {
        Authorization: authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fullKey),
        'Content-Type': args.contentType,
        'X-Bz-Content-Sha1': 'do_not_verify',
      },
    }
  }

  async writeFile(args: WriteFileArgs): Promise<boolean> {
    const fullKey = this.join(args.bucket, args.key)
    try {
      this.logger.debug(`Writing file, key: ${fullKey}`)
      const chunks: Buffer[] = []
      for await (const chunk of args.stream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      await this.uploadData(
        fullKey,
        Buffer.concat(chunks),
        undefined,
        this.bucketIdFor(args.visibility)
      )
      return true
    } catch (e: any) {
      this.logger.error(`Error writing file, key: ${fullKey}`, e)
      return false
    }
  }

  async copyFile(args: CopyFileArgs): Promise<boolean> {
    const fullKey = this.join(args.bucket, args.key)
    try {
      this.logger.debug(
        `Uploading file, key: ${fullKey} from: ${args.fromAbsolutePath}`
      )
      await this.uploadData(
        fullKey,
        await readFile(args.fromAbsolutePath),
        undefined,
        this.bucketIdFor(args.visibility)
      )
      return true
    } catch (e: any) {
      this.logger.error(`Error copying file, key: ${fullKey}`, e)
      return false
    }
  }

  async readFile(
    args: BucketKeyArgs
  ): Promise<ReadableStream | NodeJS.ReadableStream> {
    const fullKey = this.join(args.bucket, args.key)
    this.logger.debug(`Reading file, key: ${fullKey}`)
    const auth = await this.ensureAuthorized()
    const bucketName = await this.getBucketName(
      this.bucketIdFor(args.visibility)
    )
    const res = await fetch(
      `${auth.downloadUrl}/file/${bucketName}/${fullKey}`,
      { headers: { Authorization: auth.authorizationToken } }
    )
    if (!res.ok) {
      throw new Error(`B2 download failed: ${res.status}`)
    }
    return res.body!
  }

  async readFileAsBuffer(args: BucketKeyArgs): Promise<Buffer> {
    const fullKey = this.join(args.bucket, args.key)
    this.logger.debug(`Reading file as buffer, key: ${fullKey}`)
    const auth = await this.ensureAuthorized()
    const bucketName = await this.getBucketName(
      this.bucketIdFor(args.visibility)
    )
    const res = await fetch(
      `${auth.downloadUrl}/file/${bucketName}/${fullKey}`,
      { headers: { Authorization: auth.authorizationToken } }
    )
    if (!res.ok) {
      throw new Error(`B2 download failed: ${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  async deleteFile(args: BucketKeyArgs): Promise<boolean> {
    const fullKey = this.join(args.bucket, args.key)
    try {
      this.logger.debug(`Deleting file: ${fullKey}`)
      const data = await this.b2Post('b2_list_file_names', {
        bucketId: this.bucketIdFor(args.visibility),
        prefix: fullKey,
        maxFileCount: 1,
      })
      const file = data.files.find((f: any) => f.fileName === fullKey)
      if (!file) {
        this.logger.error(`File not found for deletion: ${fullKey}`)
        return false
      }
      await this.b2Post('b2_delete_file_version', {
        fileName: fullKey,
        fileId: file.fileId,
      })
      return true
    } catch (e: any) {
      this.logger.error(`Error deleting file: ${fullKey}`, e)
      return false
    }
  }

  async listFilesByPrefix(
    bucket: string,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<string[]> {
    return (await this.listFiles(bucket, prefix, visibility)).map((f) => f.key)
  }

  async deleteByPrefix(
    bucket: string,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<number> {
    const files = await this.listFiles(bucket, prefix, visibility)
    for (const file of files) {
      await this.b2Post('b2_delete_file_version', {
        fileName: this.join(bucket, file.key),
        fileId: file.fileId,
      })
    }
    return files.length
  }

  private async listFiles(
    bucket: string,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<{ key: string; fileId: string }[]> {
    const root = `${bucket}/`
    const files: { key: string; fileId: string }[] = []
    let startFileName: string | null = null
    do {
      const data: any = await this.b2Post('b2_list_file_names', {
        bucketId: this.bucketIdFor(visibility),
        prefix: `${root}${prefix}`,
        maxFileCount: 1000,
        ...(startFileName ? { startFileName } : {}),
      })
      for (const f of data.files) {
        files.push({ key: f.fileName.slice(root.length), fileId: f.fileId })
      }
      startFileName = data.nextFileName ?? null
    } while (startFileName)
    return files
  }
}
