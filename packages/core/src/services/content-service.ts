import { ReadStream } from 'fs'

export interface ContentService {
  /**
   * Signs a content key to generate a secure, time-limited access URL.
   * @param contentKey - The key representing the content object.
   * @param dateLessThan - The expiration time for the signed URL.
   * @param dateGreaterThan - (Optional) Start time before which access is denied.
   */
  signContentKey(
    contentKey: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ): Promise<string>

  /**
   * Signs an arbitrary URL to generate a secure, time-limited access URL.
   * @param url - The full URL that needs signing.
   * @param dateLessThan - The expiration time for the signed URL.
   * @param dateGreaterThan - (Optional) Start time before which access is denied.
   */
  signURL(
    url: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ): Promise<string>

  /**
   * Generates a signed URL for uploading a file directly to storage.
   * @param fileKey - The desired key/location of the uploaded file.
   * @param contentType - The MIME type of the file.
   * @returns A signed upload URL and the finalized asset key.
   */
  getUploadURL(
    fileKey: string,
    contentType: string
  ): Promise<{ uploadUrl: string; assetKey: string }>

  /**
   * Deletes a file from the storage backend.
   * @param fileName - The name or key of the file to delete.
   * @returns A boolean indicating success.
   */
  deleteFile(fileName: string): Promise<boolean>

  /**
   * Uploads a file stream to storage under a specified asset key.
   * @param assetKey - The key where the file will be saved.
   * @param stream - A readable stream of the file contents.
   * @returns A boolean indicating success.
   */
  writeFile(assetKey: string, stream: ReadStream): Promise<boolean>

  /**
   * Copies a file from a local absolute path into storage under a new asset key.
   * @param assetKey - The destination key.
   * @param fromAbsolutePath - The local absolute file path.
   * @returns A boolean indicating success.
   */
  copyFile(assetKey: string, fromAbsolutePath: string): Promise<boolean>

  /**
   * Reads a file from storage as a readable stream.
   * @param assetKey - The key of the file to read.
   * @returns A readable file stream.
   */
  readFile(assetKey: string): Promise<ReadStream>
}
