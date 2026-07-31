export interface SignContentKeyArgs<TBucket extends string = string> {
  bucket: TBucket
  contentKey: string
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
  visibility?: 'private' | 'public'
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
}
