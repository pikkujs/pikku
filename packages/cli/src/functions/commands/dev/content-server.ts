import { existsSync, createReadStream, statSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import type { IncomingMessage, ServerResponse } from 'http'
import { dirname, extname, normalize, resolve } from 'path'

/**
 * Local content server: companion to the pikku dev runtime.
 *
 *   GET  /content/<key>  →  stream `<contentDir>/<key>`
 *   PUT  /reaper/<key>   →  write request body to `<contentDir>/<key>`
 *
 * Both paths are resolved with traversal protection. `tryHandle` returns
 * `true` when a content route matched (caller must not continue), `false`
 * otherwise so the caller can fall through to the next handler.
 */

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export class ContentServer {
  private readonly contentDir: string

  constructor(contentDir: string) {
    this.contentDir = resolve(contentDir)
  }

  /**
   * Ensure the content directory exists. Idempotent.
   */
  async ensureDir(): Promise<void> {
    await mkdir(this.contentDir, { recursive: true })
  }

  /**
   * Try to handle a request as a content/reaper route. Returns true if the
   * request matched and the response has been written, false otherwise.
   */
  async tryHandle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://localhost')
    const method = req.method?.toUpperCase() ?? 'GET'

    if (method === 'PUT' && url.pathname.startsWith('/reaper/')) {
      await this.handleUpload(req, res, url.pathname.slice('/reaper/'.length))
      return true
    }

    if (method === 'GET' && url.pathname.startsWith('/content/')) {
      this.handleDownload(res, url.pathname.slice('/content/'.length))
      return true
    }

    return false
  }

  describe(port: number, hostname: string): string {
    return [
      `Content server enabled (${this.contentDir}):`,
      `  GET  http://${hostname}:${port}/content/<key>`,
      `  PUT  http://${hostname}:${port}/reaper/<key>`,
    ].join('\n')
  }

  private safeTarget(key: string): string | null {
    const target = resolve(this.contentDir, normalize(key))
    if (
      target !== this.contentDir &&
      !target.startsWith(this.contentDir + '/')
    ) {
      return null
    }
    return target
  }

  private async handleUpload(
    req: IncomingMessage,
    res: ServerResponse,
    key: string
  ): Promise<void> {
    const target = this.safeTarget(key)
    if (!target) {
      res.writeHead(400).end('Invalid path')
      return
    }
    try {
      await mkdir(dirname(target), { recursive: true })
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      await writeFile(target, Buffer.concat(chunks))
      res.writeHead(204).end()
    } catch (err) {
      res.writeHead(500).end(String(err))
    }
  }

  private handleDownload(res: ServerResponse, key: string): void {
    const target = this.safeTarget(key)
    if (!target || !existsSync(target) || !statSync(target).isFile()) {
      res.writeHead(404).end('Not found')
      return
    }
    const mime =
      MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    createReadStream(target).pipe(res)
  }
}
