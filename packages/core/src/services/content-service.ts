/**
 * Whether stored content is served only through signed URLs (`private`) or at a
 * plain URL anyone can fetch (`public`).
 */
export type ContentVisibility = 'private' | 'public'

/**
 * Arguments for signing a URL to one stored object, valid inside the given time
 * window.
 */
export interface SignContentKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  contentKey: string
  visibility?: ContentVisibility
  dateLessThan: Date
  dateGreaterThan?: Date
}

/**
 * Arguments for signing an arbitrary URL, valid inside the given time window.
 */
export interface SignURLArgs {
  url: string
  dateLessThan: Date
  dateGreaterThan?: Date
}

/**
 * Arguments for a pre-signed upload. `bucket` is any name you choose, and
 * `fileKey` is the key the file is stored under, which the server builds and
 * saves; never take it from the caller. `contentType` and `size` describe the
 * file and are not checked here, so the function handing out the URL allows or
 * refuses a type itself. The most an upload may hold is `content.sizeLimit` in
 * pikku.config.json, `1mb` by default.
 */
export interface GetUploadURLArgs<TBucket extends string = string> {
  bucket: TBucket
  fileKey: string
  contentType: string
  size?: number
  visibility?: ContentVisibility
}

/**
 * Where and how the client sends the file: the raw bytes as the request body,
 * without the caller's session token, because the URL itself is the grant.
 * A browser can only send it from the server's own origin, so a page served
 * elsewhere proxies the upload route. An `<img>` reads a download URL from any
 * origin; `fetch` does not.
 */
export interface UploadURLResult {
  /** May be relative to the server. `uploadFile` on the fetch client resolves it; otherwise use `new URL(uploadUrl, serverUrl)`. */
  uploadUrl: string
  /** The `fileKey` passed in, relative to the bucket. This is what reads take. */
  fileKey: string
  /** Send every one of these with the upload when present. */
  uploadHeaders?: Record<string, string>
  /** `PUT` when absent. */
  uploadMethod?: 'PUT' | 'POST'
}

/** Identifies one stored object. */
export interface BucketKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  key: string
  visibility?: ContentVisibility
}

/**
 * Identifies an object to download and how long a signed URL for it should stay
 * valid.
 */
export interface GetDownloadURLArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  expiresInSeconds?: number
}

/** An object to write from a stream. */
export interface WriteFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  stream: ReadableStream | NodeJS.ReadableStream
}

/** An object to write from a file already on the server. */
export interface CopyFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  fromAbsolutePath: string
}

/**
 * File storage, reached as the `content` service: `async ({ content }) => ...`.
 * A bucket is a name you pick, created by the first write.
 *
 * A file goes straight from the client to a signed upload URL and never through
 * a function as base64; the function only hands out the URL and saves the key.
 * Save the key, not the URL or the file.
 *
 * Content is private by default and read through signed, expiring URLs, so the
 * function that hands one out decides who may read the file: put a permission
 * on it. Inside a function, `readFileAsBuffer` gets the bytes, for example for
 * an agent's `attachments`.
 *
 * @example snippet: contentConfig
 * @example snippet: contentUploadUrl
 * @example snippet: contentBrowserUpload
 * @example snippet: contentSaveKey
 * @example snippet: contentDownloadUrl
 * @example snippet: contentAgentAttachment
 */
export interface ContentService<TBucket extends string = string> {
  /** A URL to one object that stops working at `dateLessThan`. `getDownloadURL` is the shorter call. */
  signContentKey(args: SignContentKeyArgs<TBucket>): Promise<string>

  /** Signs a URL you already have. Refused inside an addon. */
  signURL(args: SignURLArgs): Promise<string>

  /** A short-lived URL the client sends the file to. Checks neither `contentType` nor `size`. */
  getUploadURL(args: GetUploadURLArgs<TBucket>): Promise<UploadURLResult>

  /** Returns false rather than throwing when the file could not be deleted. */
  deleteFile(args: BucketKeyArgs<TBucket>): Promise<boolean>

  /** Stores a stream the server produced. Returns false rather than throwing on failure. */
  writeFile(args: WriteFileArgs<TBucket>): Promise<boolean>

  /** Stores a file from a path on the server. Returns false rather than throwing on failure. Refused inside an addon. */
  copyFile(args: CopyFileArgs<TBucket>): Promise<boolean>

  /** Streams a stored file. */
  readFile(
    args: BucketKeyArgs<TBucket>
  ): Promise<ReadableStream | NodeJS.ReadableStream>

  /** The whole file in memory, for a function that needs the bytes. */
  readFileAsBuffer(args: BucketKeyArgs<TBucket>): Promise<Buffer>

  /** A signed URL for private content, the plain URL for public content. */
  getDownloadURL(args: GetDownloadURLArgs<TBucket>): Promise<string>

  /** Returns how many files were deleted. */
  deleteByPrefix(
    bucket: TBucket,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<number>

  /** Returns the keys, relative to the bucket, that start with the prefix. */
  listFilesByPrefix(
    bucket: TBucket,
    prefix: string,
    visibility?: ContentVisibility
  ): Promise<string[]>
}
