/**
 * Arguments for signing a content key into a time-limited URL.
 */
export interface SignContentKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  contentKey: string
  dateLessThan: Date
  dateGreaterThan?: Date
}

/**
 * Arguments for signing an arbitrary URL.
 */
export interface SignURLArgs {
  url: string
  dateLessThan: Date
  dateGreaterThan?: Date
}

/**
 * Arguments for minting a presigned upload URL.
 */
export interface GetUploadURLArgs<TBucket extends string = string> {
  bucket: TBucket
  fileKey: string
  contentType: string
  size?: number
}

/**
 * Result of minting a presigned upload URL.
 */
export interface UploadURLResult {
  uploadUrl: string
  assetKey: string
  uploadHeaders?: Record<string, string>
  uploadMethod?: 'PUT' | 'POST'
}

/**
 * Arguments for an operation that targets a single object by key.
 */
export interface BucketKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  key: string
}

/**
 * Arguments for writing a stream to storage.
 */
export interface WriteFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  stream: ReadableStream | NodeJS.ReadableStream
}

/**
 * Arguments for copying a local file into storage.
 */
export interface CopyFileArgs<
  TBucket extends string = string,
> extends BucketKeyArgs<TBucket> {
  fromAbsolutePath: string
}

export interface ContentService<TBucket extends string = string> {
  /**
   * Signs a content key to generate a secure, time-limited access URL.
   */
  signContentKey(args: SignContentKeyArgs<TBucket>): Promise<string>

  /**
   * Signs an arbitrary URL to generate a secure, time-limited access URL.
   */
  signURL(args: SignURLArgs): Promise<string>

  /**
   * Generates a signed URL for uploading a file directly to storage.
   * Bucket policy (size limits, MIME allowlist) is enforced by the implementation.
   */
  getUploadURL(args: GetUploadURLArgs<TBucket>): Promise<UploadURLResult>

  /**
   * Deletes a file from the storage backend.
   */
  deleteFile(args: BucketKeyArgs<TBucket>): Promise<boolean>

  /**
   * Uploads a file stream to storage under the specified bucket + key.
   */
  writeFile(args: WriteFileArgs<TBucket>): Promise<boolean>

  /**
   * Copies a file from a local absolute path into storage.
   */
  copyFile(args: CopyFileArgs<TBucket>): Promise<boolean>

  /**
   * Reads a file from storage as a readable stream.
   */
  readFile(
    args: BucketKeyArgs<TBucket>
  ): Promise<ReadableStream | NodeJS.ReadableStream>

  /**
   * Reads an entire file from storage into a Buffer.
   */
  readFileAsBuffer(args: BucketKeyArgs<TBucket>): Promise<Buffer>
}
