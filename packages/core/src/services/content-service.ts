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
 * Arguments for a pre-signed upload. `size` and `contentType` are checked
 * against the bucket's policy by the implementation.
 */
export interface GetUploadURLArgs<TBucket extends string = string> {
  bucket: TBucket
  fileKey: string
  contentType: string
  size?: number
  visibility?: ContentVisibility
}

/**
 * Where and how the client should upload, and the key the file will be stored
 * under.
 */
export interface UploadURLResult {
  uploadUrl: string
  assetKey: string
  uploadHeaders?: Record<string, string>
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

/** An object to write from a file already on local disk. */
export interface CopyFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  fromAbsolutePath: string
}

/**
 * File storage behind the `content` service: uploads, downloads and signed URLs
 * over named buckets (S3, R2, or local disk in development).
 *
 * Private content is reachable only through signed, expiring URLs, so a
 * function that hands one out decides who may read the file. Upload URLs carry
 * the bucket's policy; callers do not need to re-check size or MIME type.
 */
export interface ContentService<TBucket extends string = string> {
  signContentKey(args: SignContentKeyArgs<TBucket>): Promise<string>

  signURL(args: SignURLArgs): Promise<string>

  /** Bucket policy (size limits, MIME allowlist) is enforced by the implementation, not the caller. */
  getUploadURL(args: GetUploadURLArgs<TBucket>): Promise<UploadURLResult>

  deleteFile(args: BucketKeyArgs<TBucket>): Promise<boolean>

  writeFile(args: WriteFileArgs<TBucket>): Promise<boolean>

  copyFile(args: CopyFileArgs<TBucket>): Promise<boolean>

  readFile(
    args: BucketKeyArgs<TBucket>
  ): Promise<ReadableStream | NodeJS.ReadableStream>

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
