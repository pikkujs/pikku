export type ContentVisibility = 'private' | 'public'

export interface SignContentKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  contentKey: string
  visibility?: ContentVisibility
  dateLessThan: Date
  dateGreaterThan?: Date
}

export interface SignURLArgs {
  url: string
  dateLessThan: Date
  dateGreaterThan?: Date
}

export interface GetUploadURLArgs<TBucket extends string = string> {
  bucket: TBucket
  fileKey: string
  contentType: string
  size?: number
  visibility?: ContentVisibility
}

export interface UploadURLResult {
  uploadUrl: string
  assetKey: string
  uploadHeaders?: Record<string, string>
  uploadMethod?: 'PUT' | 'POST'
}

export interface BucketKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  key: string
  visibility?: ContentVisibility
}

export interface GetDownloadURLArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  expiresInSeconds?: number
}

export interface WriteFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  stream: ReadableStream | NodeJS.ReadableStream
}

export interface CopyFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  fromAbsolutePath: string
}

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
