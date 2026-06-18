import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rm, stat } from 'fs/promises'
import { resolve } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Logger } from './logger.js'

export class TemporaryFileInstance {
  private files: string[] = []

  constructor(
    private logger: Logger,
    private tempDir: string
  ) {
    this.tempDir = resolve(tempDir)
    logger.debug(`Using temp dir ${this.tempDir}`)
  }

  public getFile(key: string): ReadableStream | NodeJS.ReadableStream {
    return createReadStream(`${this.tempDir}/${key}`)
  }

  public async writeFile(
    key: string,
    stream: ReadableStream | NodeJS.ReadableStream
  ): Promise<void> {
    await this.createDir(key)
    const filePath = `${this.tempDir}/${key}`
    const fileStream = createWriteStream(filePath)
    await pipeline(stream as Readable, fileStream)
    this.files.push(filePath)
    this.logger.debug(`Wrote file: ${filePath}`)
  }

  public async deleteFile(key: string): Promise<void> {
    await rm(`${this.tempDir}/${key}`)
    this.logger.debug(`Deleted file ${this.tempDir}/${key}`)
  }

  public async hasFile(key: string): Promise<boolean> {
    try {
      return !!(await stat(`${this.tempDir}/${key}`))
    } catch {
      return false
    }
  }

  public async getTempFileAbsolutePath(key: string): Promise<string> {
    await this.createDir(key)
    return `${this.tempDir}/${key}`
  }

  private async createDir(key: string) {
    const dir = `${this.tempDir}/${key}`.split('/').slice(0, -1).join('/')
    if (!(await this.hasFile(dir))) {
      await mkdir(dir, { recursive: true })
    }
  }

  public async cleanup() {
    await Promise.all(this.files.map((file) => rm(file)))
  }
}

export class TemporaryFileService {
  constructor(
    private logger: Logger,
    private tempDir: string
  ) {
    this.tempDir = resolve(tempDir)
  }

  public createInstance() {
    return new TemporaryFileInstance(this.logger, this.tempDir)
  }
}
