import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Abstraction over .pikku metadata file access.
 * All paths are relative to the .pikku root directory.
 *
 * Node.js uses LocalMetaService (filesystem).
 * Cloudflare uses an R2/KV implementation.
 */
export interface MetaService {
  readFile(relativePath: string): Promise<string | null>
  readDir(relativePath: string): Promise<string[]>
}

/**
 * Node.js filesystem implementation of MetaService.
 * Reads .gen.json files from a local .pikku directory.
 */
export class LocalMetaService implements MetaService {
  public readonly basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
  }

  async readFile(relativePath: string): Promise<string | null> {
    try {
      return await readFile(join(this.basePath, relativePath), 'utf-8')
    } catch {
      return null
    }
  }

  async readDir(relativePath: string): Promise<string[]> {
    try {
      return await readdir(join(this.basePath, relativePath))
    } catch {
      return []
    }
  }
}
