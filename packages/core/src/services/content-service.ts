import { ReadStream } from 'fs'
import { Readable } from 'stream'

/**
 * Interface for handling content operations.
 */
export interface ContentService {
  /**
   * Signs a content key to provide secure access.
   * @param contentKey - The key of the content to sign.
   * @returns A promise that resolves to the signed content key URL.
   */
  signContentKey: (
    contentKey: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ) => Promise<string>

  /**
   * Signs a URL to provide secure access.
   * @param url - The URL to sign.
   * @returns A promise that resolves to the signed URL.
   */
  signURL: (
    url: string,
    dateLessThan: Date,
    dateGreaterThan?: Date
  ) => Promise<string>

  /**
   * Gets an upload URL for a file.
   * @param fileKey - The key of the file to upload.
   * @param contentType - The content type of the file.
   * @returns A promise that resolves to an object containing the upload URL and asset key.
   *  This method generates an upload URL for the specified file key and content type, allowing the file to be uploaded.
   */
  getUploadURL: (
    fileKey: string,
    contentType: string
  ) => Promise<{ uploadUrl: string; assetKey: string }>

  /**
   * Deletes a file.
   * @param fileName - The name of the file to delete.
   * @returns A promise that resolves to a boolean indicating success.
   *  This method deletes the specified file and returns a boolean indicating whether the deletion was successful.
   */
  deleteFile: (fileName: string) => Promise<boolean>

  /**
   * Writes a file.
   * @param assetKey - The key of the asset to write.
   * @param stream - The ReadStream of the file to write.
   * @returns A promise that resolves to a boolean indicating success.
   */
  writeFile: (assetKey: string, stream: ReadStream) => Promise<boolean>

  /**
   * This method copies the file from the specified absolute path to the location identified by the asset key and returns a boolean indicating success.
   * @param assetKey - The key of the asset to copy.
   * @param fromAbsolutePath - The absolute path of the source file.
   * @returns A promise that resolves to a boolean indicating success.
   */
  copyFile: (assetKey: string, fromAbsolutePath: string) => Promise<boolean>

  /**
   * Reads a file.
   * @param assetKey - The key of the asset to read.
   * @returns A promise that resolves to a Readable stream of the file.
   */
  readFile: (assetKey: string) => Promise<Readable>
}
