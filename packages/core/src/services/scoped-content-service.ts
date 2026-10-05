import type {
  BucketKeyArgs,
  ContentService,
  CopyFileArgs,
  GetUploadURLArgs,
  SignContentKeyArgs,
  SignURLArgs,
  UploadURLResult,
  WriteFileArgs,
} from './content-service.js'

export type ContentGrantMode = 'read' | 'write'

const MAX_DECODE_PASSES = 4

const denied = (value: string): never => {
  throw new Error(`Access denied to content path: ${value}`)
}

const decoded = (value: string): string[] => {
  const passes = [value]
  let current = value
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    let next: string
    try {
      next = decodeURIComponent(current)
    } catch {
      return denied(value)
    }
    if (next === current) return passes
    passes.push(next)
    current = next
  }
  return denied(value)
}

export const normaliseContentPath = (value: string): string => {
  for (const pass of decoded(value)) {
    if (pass.includes('\0')) denied(value)
    if (pass.startsWith('/') || pass.startsWith('\\')) denied(value)
    for (const segment of pass.split(/[\\/]/)) {
      if (segment === '..' || segment === '.') denied(value)
    }
  }
  const segments = value.split('/').filter((segment) => segment !== '')
  return segments.join('/')
}

const under = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`)

const join = (...parts: string[]): string =>
  parts.filter((part) => part !== '').join('/')

/**
 * A `ContentService` narrowed to one folder of the store.
 *
 * Whatever bucket the addon names lands under `<root>/<bucket>`, and the keys
 * and buckets it passes are refused if they climb out. Starting a bucket with
 * `@` names a path from the root of the store instead, which only works under
 * a prefix the host granted: `read` allows reads and signed downloads, `write`
 * adds uploads, writes and deletes, and the longest matching prefix decides.
 * `signURL` and `copyFile` take a finished URL or a local filesystem path, so
 * neither can be narrowed to a folder and both are refused.
 */
export class ScopedContentService implements ContentService {
  private root: string
  private grants: [string, ContentGrantMode][]

  constructor(
    private content: ContentService,
    root: string,
    grants: Record<string, ContentGrantMode> = {}
  ) {
    this.root = normaliseContentPath(root)
    if (!this.root) denied(root)
    this.grants = Object.entries(grants)
      .map(([prefix, mode]): [string, ContentGrantMode] => {
        const clean = normaliseContentPath(prefix)
        if (!clean) denied(prefix)
        if (mode !== 'read' && mode !== 'write') {
          throw new Error(`Content grant '${prefix}' must be 'read' or 'write'`)
        }
        return [clean, mode]
      })
      .sort(([a], [b]) => b.length - a.length)
  }

  private resolve(
    bucket: string,
    key: string,
    need: ContentGrantMode
  ): { bucket: string; key: string } {
    const cleanKey = normaliseContentPath(key)
    if (!bucket.startsWith('@')) {
      return {
        bucket: join(this.root, normaliseContentPath(bucket)),
        key: cleanKey,
      }
    }
    const path = normaliseContentPath(bucket.slice(1))
    const full = join(path, cleanKey)
    if (under(full, this.root)) return { bucket: path, key: cleanKey }
    const grant = this.grants.find(([prefix]) => under(full, prefix))
    if (!grant || (need === 'write' && grant[1] !== 'write')) {
      return denied(bucket)
    }
    return { bucket: path, key: cleanKey }
  }

  async signContentKey(args: SignContentKeyArgs): Promise<string> {
    const { bucket, key } = this.resolve(args.bucket, args.contentKey, 'read')
    return this.content.signContentKey({ ...args, bucket, contentKey: key })
  }

  async signURL(_args: SignURLArgs): Promise<string> {
    throw new Error('signURL is not allowed in scoped content service')
  }

  async getUploadURL(args: GetUploadURLArgs): Promise<UploadURLResult> {
    const { bucket, key } = this.resolve(args.bucket, args.fileKey, 'write')
    return this.content.getUploadURL({ ...args, bucket, fileKey: key })
  }

  async deleteFile(args: BucketKeyArgs): Promise<boolean> {
    const { bucket, key } = this.resolve(args.bucket, args.key, 'write')
    return this.content.deleteFile({ bucket, key })
  }

  async writeFile(args: WriteFileArgs): Promise<boolean> {
    const { bucket, key } = this.resolve(args.bucket, args.key, 'write')
    return this.content.writeFile({ ...args, bucket, key })
  }

  async copyFile(_args: CopyFileArgs): Promise<boolean> {
    throw new Error('copyFile is not allowed in scoped content service')
  }

  async readFile(
    args: BucketKeyArgs
  ): Promise<ReadableStream | NodeJS.ReadableStream> {
    const { bucket, key } = this.resolve(args.bucket, args.key, 'read')
    return this.content.readFile({ bucket, key })
  }

  async readFileAsBuffer(args: BucketKeyArgs): Promise<Buffer> {
    const { bucket, key } = this.resolve(args.bucket, args.key, 'read')
    return this.content.readFileAsBuffer({ bucket, key })
  }
}
