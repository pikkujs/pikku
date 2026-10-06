import { createReadStream, createWriteStream, promises } from 'fs'
import { randomUUID } from 'crypto'
import { mkdir, readFile, readdir, rename, rm, stat } from 'fs/promises'
import { resolve, normalize, sep } from 'path'
import type {
  BucketKeyArgs,
  ContentService,
  ContentVisibility,
  GetDownloadURLArgs,
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
import { Transform, type Readable } from 'stream'

export interface LocalContentConfig {
  localFileUploadPath: string
  uploadUrlPrefix: string
  assetUrlPrefix: string
  server?: string
  sizeLimit?: string
}

/**
 * The representation of an asset that gets bound into a signed URL's
 * signature, and that a server can reconstruct from an incoming request:
 * the decoded path, without origin or query string.
 *
 * Both sides must derive it the same way, so signer and verifier share this
 * function. Percent escapes are decoded so that a client re-encoding an
 * optional character still matches; a malformed escape is left verbatim
 * rather than throwing, which keeps both sides in agreement.
 */
export const signedContentPath = (urlOrPath: string): string => {
  let pathname: string
  try {
    pathname = new URL(urlOrPath, 'http://pikku.local').pathname
  } catch {
    pathname = urlOrPath
  }
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

export const PUBLIC_URL_SEGMENT = '_public'

export const CONTENT_VISIBILITIES: readonly ContentVisibility[] = [
  'private',
  'public',
]

export type ContentUrlPath = {
  visibility: ContentVisibility
  rest: string
  prefixed: boolean
}

/**
 * Splits the part of a content URL after the asset/upload prefix into the
 * visibility it names and the `<bucket>/<key>` remainder. Only a leading
 * `_public/` segment names the public side; anything else is private.
 * Private buckets may therefore not be named `_public`.
 */
export const parseContentUrlPath = (key: string): ContentUrlPath => {
  const [first, ...rest] = key.split('/')
  if (first === PUBLIC_URL_SEGMENT) {
    return { visibility: 'public', rest: rest.join('/'), prefixed: true }
  }
  return { visibility: 'private', rest: key, prefixed: false }
}

/**
 * Resolves `<bucket>/<key>` against one side of the store. The side is a
 * directory under the content root, and both the bucket and the key must stay
 * inside it, so neither side can climb out or reach the other.
 */
export const resolveVisibilityPath = (
  basePath: string,
  visibility: ContentVisibility,
  bucket: string,
  key: string
): string | null => {
  if (!CONTENT_VISIBILITIES.includes(visibility)) return null
  if (bucket.includes('\0') || key.includes('\0')) return null
  if (visibility === 'private') {
    const [first] = normalize(bucket).split(/[\\/]/)
    if (first === PUBLIC_URL_SEGMENT) return null
  }
  const root = resolve(resolve(basePath), visibility)
  const scoped = resolve(root, normalize(bucket))
  const target = resolve(scoped, normalize(key))
  const inside = (path: string) => path === root || path.startsWith(root + sep)
  if (!inside(scoped) || !inside(target)) return null
  return target
}

export type ContentRequestTarget = {
  path: string
  visibility: ContentVisibility
}

/**
 * Maps the part of a content URL after the asset/upload prefix to a file under
 * the content root: `_public/...` to the public side, anything else to the
 * private side, falling back for reads to an unprefixed file from before the
 * split. Returns `null` for a path that escapes its side or names no file.
 * Every server of local content resolves through here, and skips the signature
 * check only when the result is public.
 */
export const resolveContentRequestTarget = async (
  basePath: string,
  key: string,
  mode: 'read' | 'write'
): Promise<ContentRequestTarget | null> => {
  const parsed = parseContentUrlPath(key)
  const root = resolve(resolve(basePath), parsed.visibility)
  const path = resolveVisibilityPath(
    basePath,
    parsed.visibility,
    parsed.rest,
    ''
  )
  if (!path || path === root) return null
  if (mode === 'read' && !parsed.prefixed) {
    const exists = await stat(path).then(
      () => true,
      () => false
    )
    if (!exists) {
      const [first] = normalize(parsed.rest).split(/[\\/]/)
      const base = resolve(basePath)
      const legacy = resolve(base, normalize(parsed.rest))
      if (
        first !== PUBLIC_URL_SEGMENT &&
        first !== 'private' &&
        legacy.startsWith(base + sep)
      ) {
        return { path: legacy, visibility: 'private' }
      }
    }
  }
  return { path, visibility: parsed.visibility }
}

/** How long a presigned upload URL stays valid. Short, like an S3 PUT URL. */
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000

export class UploadTooLargeError extends Error {
  constructor() {
    super('content_too_large')
  }
}

export const parseContentSizeLimit = (sizeLimit: string): number => {
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i.exec(sizeLimit.trim())
  if (!match) {
    throw new Error(`Invalid size limit: ${sizeLimit}`)
  }
  const unit = (match[2] ?? 'b').toLowerCase()
  const multiplier =
    unit === 'gb'
      ? 1024 * 1024 * 1024
      : unit === 'mb'
        ? 1024 * 1024
        : unit === 'kb'
          ? 1024
          : 1
  return Number(match[1]) * multiplier
}

export const streamUploadToFile = async (
  source: AsyncIterable<Uint8Array>,
  targetPath: string,
  maxBytes: number
): Promise<number> => {
  await mkdir(resolve(targetPath, '..'), { recursive: true })
  const partial = `${targetPath}.${process.pid}.${Date.now()}.${randomUUID()}.part`
  let bytes = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (bytes > maxBytes) {
        callback(new UploadTooLargeError())
        return
      }
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      source as AsyncIterable<Buffer>,
      counter,
      createWriteStream(partial)
    )
    await rename(partial, targetPath)
    return bytes
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

export class LocalContent implements ContentService {
  constructor(
    private config: LocalContentConfig,
    private logger: Logger,
    private jwt: JWTService
  ) {
    if (!jwt) {
      throw new Error(
        'LocalContent requires a JWTService: without one it cannot sign asset URLs, and unsigned URLs cannot be verified.'
      )
    }
  }

  private safePath(
    bucket: string,
    key: string,
    visibility: ContentVisibility = 'private'
  ): string {
    const target = resolveVisibilityPath(
      this.config.localFileUploadPath,
      visibility,
      bucket,
      key
    )
    if (!target) {
      throw new Error('Invalid asset key')
    }
    return target
  }

  private async existingPath(
    bucket: string,
    key: string,
    visibility: ContentVisibility = 'private'
  ): Promise<string> {
    const path = this.safePath(bucket, key, visibility)
    if (visibility === 'private') {
      const exists = await stat(path).then(
        () => true,
        () => false
      )
      if (!exists) {
        const legacy = this.legacyPath(bucket, key)
        if (
          legacy &&
          (await stat(legacy).then(
            () => true,
            () => false
          ))
        ) {
          return legacy
        }
      }
    }
    return path
  }

  private legacyPath(bucket: string, key: string): string | null {
    const [first] = normalize(bucket).split(/[\\/]/)
    if (first === PUBLIC_URL_SEGMENT || first === 'private') return null
    const base = resolve(this.config.localFileUploadPath)
    const target = resolve(base, normalize(bucket), normalize(key))
    return target.startsWith(base + sep) ? target : null
  }

  private publicBase(): string {
    const origin = this.config.server ?? ''
    return `${origin}${this.config.assetUrlPrefix}/${PUBLIC_URL_SEGMENT}`
  }

  private joinKey(bucket: string, key: string): string {
    return `${bucket}/${key}`
  }

  public async init() {}

  private async signParams(
    url: string,
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
    const expiresInSeconds = Math.max(
      1,
      Math.floor((expiresAt - signedAt) / 1000)
    )
    const payload: {
      signedAt: number
      expiresAt: number
      notBefore?: number
      path: string
    } = {
      signedAt,
      expiresAt,
      path: signedContentPath(url),
    }
    if (dateGreaterThan) {
      payload.notBefore = dateGreaterThan.getTime()
    }
    const signature = await this.jwt.encode(
      { value: expiresInSeconds, unit: 'second' },
      payload
    )
    params.set('signature', signature)
    return params.toString()
  }

  public async signURL(args: SignURLArgs): Promise<string> {
    const params = await this.signParams(
      args.url,
      args.dateLessThan,
      args.dateGreaterThan
    )
    return `${args.url}?${params}`
  }

  public async signContentKey(args: SignContentKeyArgs): Promise<string> {
    const visibility = args.visibility ?? 'private'
    this.safePath(args.bucket, args.contentKey, visibility)
    const fullKey = this.joinKey(args.bucket, args.contentKey)
    const origin = this.config.server ?? ''
    if (visibility === 'public') {
      return `${this.publicBase()}/${fullKey}`
    }
    return this.signURL({
      url: `${origin}${this.config.assetUrlPrefix}/${fullKey}`,
      dateLessThan: args.dateLessThan,
      dateGreaterThan: args.dateGreaterThan,
    })
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

  /**
   * Presigned upload, mirroring the read side: the URL carries a short-lived,
   * path-bound signature that {@link createLocalContentRequestHandler} verifies
   * before writing. An unsigned upload URL cannot be verified, and the handler
   * now refuses one — so this must sign, or every upload 403s.
   */
  public async getUploadURL(args: GetUploadURLArgs): Promise<UploadURLResult> {
    const visibility = args.visibility ?? 'private'
    this.safePath(args.bucket, args.fileKey, visibility)
    const fullKey = this.joinKey(args.bucket, args.fileKey)
    this.logger.debug(`Going to upload with key: ${fullKey}`)
    const uploadUrl = await this.signURL({
      url: `${this.config.uploadUrlPrefix}/${visibility === 'public' ? `${PUBLIC_URL_SEGMENT}/` : ''}${fullKey}`,
      dateLessThan: new Date(Date.now() + UPLOAD_URL_TTL_MS),
    })
    return {
      uploadUrl,
      assetKey: fullKey,
      uploadMethod: 'PUT',
    }
  }

  public async writeFile(args: WriteFileArgs): Promise<boolean> {
    this.logger.debug(`Writing file: ${args.bucket}/${args.key}`)

    const path = this.safePath(args.bucket, args.key, args.visibility)

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
      const path = this.safePath(args.bucket, args.key, args.visibility)
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

    const filePath = await this.existingPath(
      args.bucket,
      args.key,
      args.visibility
    )

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
    const filePath = await this.existingPath(
      args.bucket,
      args.key,
      args.visibility
    )
    this.logger.debug(`Reading file as buffer: ${args.bucket}/${args.key}`)
    return readFile(filePath)
  }

  public async deleteFile(args: BucketKeyArgs): Promise<boolean> {
    this.logger.debug(`deleting key: ${args.bucket}/${args.key}`)
    try {
      await promises.unlink(
        this.safePath(args.bucket, args.key, args.visibility)
      )
      return true
    } catch (e: any) {
      this.logger.error(`Error deleting content ${args.bucket}/${args.key}`, e)
    }
    return false
  }

  public async listFilesByPrefix(
    bucket: string,
    prefix: string,
    visibility: ContentVisibility = 'private'
  ): Promise<string[]> {
    const root = this.safePath(bucket, '', visibility)
    const keys: string[] = []
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const next = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) await walk(resolve(dir, entry.name), next)
        else if (entry.isFile() && next.startsWith(prefix)) keys.push(next)
      }
    }
    this.safePath(bucket, prefix, visibility)
    await walk(root, '')
    return keys.sort()
  }

  public async deleteByPrefix(
    bucket: string,
    prefix: string,
    visibility: ContentVisibility = 'private'
  ): Promise<number> {
    const keys = await this.listFilesByPrefix(bucket, prefix, visibility)
    let deleted = 0
    for (const key of keys) {
      if (await this.deleteFile({ bucket, key, visibility })) deleted++
    }
    return deleted
  }

  private async createDirectoryForFile(path: string): Promise<void> {
    const dir = path.split('/').slice(0, -1).join('/')
    await mkdir(dir, { recursive: true })
  }
}
