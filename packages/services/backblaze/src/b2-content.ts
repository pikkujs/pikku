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
}

interface B2Auth {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
}

export class B2Content implements ContentService {
  private bucketId: string
  private bucketName: string | null = null
  private auth: B2Auth | null = null
  private credentials: string

  constructor(
    config: B2ContentConfig,
    private logger: Logger
  ) {
    this.bucketId = config.bucketId
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

  private async getBucketName(): Promise<string> {
    if (!this.bucketName) {
      const data = await this.b2Post('b2_list_buckets', {
        accountId: ((await this.ensureAuthorized()) as any).accountId,
        bucketId: this.bucketId,
      })
      this.bucketName = data.buckets[0].bucketName
    }
    return this.bucketName!
  }

  private async getUploadToken(): Promise<{
    uploadUrl: string
    authorizationToken: string
  }> {
    return await this.b2Post('b2_get_upload_url', {
      bucketId: this.bucketId,
    })
  }

  private async uploadData(
    fileName: string,
    data: Buffer | Uint8Array,
    contentType = 'application/octet-stream'
  ) {
    const { uploadUrl, authorizationToken } = await this.getUploadToken()
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
    validDurationInSeconds: number
  ): Promise<string> {
    const data = await this.b2Post('b2_get_download_authorization', {
      bucketId: this.bucketId,
      fileNamePrefix,
      validDurationInSeconds,
    })
    return data.authorizationToken
  }

  async signContentKey(args: SignContentKeyArgs): Promise<string> {
    const fullKey = this.join(args.bucket, args.contentKey)
    const auth = await this.ensureAuthorized()
    const bucketName = await this.getBucketName()
    const durationSeconds = Math.max(
      1,
      Math.floor((args.dateLessThan.getTime() - Date.now()) / 1000)
    )
    const downloadAuth = await this.getDownloadAuthorization(
      fullKey,
      durationSeconds
    )
    return `${auth.downloadUrl}/file/${bucketName}/${fullKey}?Authorization=${downloadAuth}`
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
    const { uploadUrl, authorizationToken } = await this.getUploadToken()
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
      await this.uploadData(fullKey, Buffer.concat(chunks))
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
      await this.uploadData(fullKey, await readFile(args.fromAbsolutePath))
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
    const bucketName = await this.getBucketName()
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
    const bucketName = await this.getBucketName()
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
        bucketId: this.bucketId,
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
}
