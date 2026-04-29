import { existsSync, createReadStream, createWriteStream, statSync } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { pipeline } from 'stream/promises'
import type { IncomingMessage, ServerResponse } from 'http'
import { dirname, extname, isAbsolute, relative, resolve } from 'path'

/**
 * Local content server: companion to the pikku dev runtime.
 *
 *   GET  /content/<key>  →  stream `<contentDir>/<key>`
 *   PUT  /reaper/<key>   →  write request body to `<contentDir>/<key>`
 *
 * Both paths are resolved with traversal protection. `tryHandle` returns
 * `true` when a content route matched (caller must not continue), `false`
 * otherwise so the caller can fall through to the next handler.
 *
 * The reaper endpoint is dev-only — it accepts unauthenticated PUTs so the
 * generated scaffold + browser console can write back artifacts during a
 * dev session. To avoid catastrophic mistakes:
 *   - Uploads stream to disk (no full-buffer in memory).
 *   - A configurable byte cap (default 50 MiB) terminates oversized
 *     requests cleanly.
 *   - The optional `token` is checked via `X-Pikku-Reaper-Token` so
 *     anyone wiring this through a non-loopback bind has a safety knob.
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

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export interface ContentServerOptions {
  /** Cap on a single upload body in bytes. */
  maxUploadBytes?: number
  /** If set, PUT /reaper/* requires `X-Pikku-Reaper-Token: <token>`. */
  token?: string
}

export class ContentServer {
  private readonly contentDir: string
  private readonly maxUploadBytes: number
  private readonly token: string | undefined

  constructor(contentDir: string, options: ContentServerOptions = {}) {
    this.contentDir = resolve(contentDir)
    this.maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
    this.token = options.token
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.contentDir, { recursive: true })
  }

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
    const auth = this.token ? ' (token required)' : ''
    return [
      `Content server enabled (${this.contentDir}):`,
      `  GET  http://${hostname}:${port}/content/<key>`,
      `  PUT  http://${hostname}:${port}/reaper/<key>${auth}`,
      `  Upload cap: ${(this.maxUploadBytes / 1024 / 1024).toFixed(0)} MiB`,
    ].join('\n')
  }

  /**
   * Resolve `key` against contentDir, refusing anything that escapes via
   * `..` or absolute paths. Uses `path.relative` so it works on both POSIX
   * and Windows (path separators differ — a literal `/` prefix check
   * silently breaks on Windows).
   */
  private safeTarget(key: string): string | null {
    const target = resolve(this.contentDir, key)
    const rel = relative(this.contentDir, target)
    if (rel === '') return target // exact contentDir = empty key, reject below
    if (rel.startsWith('..') || isAbsolute(rel)) return null
    return target
  }

  private async handleUpload(
    req: IncomingMessage,
    res: ServerResponse,
    key: string
  ): Promise<void> {
    if (this.token) {
      const presented = req.headers['x-pikku-reaper-token']
      if (presented !== this.token) {
        res.writeHead(401).end('Unauthorized')
        return
      }
    }

    const target = this.safeTarget(key)
    if (!target || !key) {
      res.writeHead(400).end('Invalid path')
      return
    }

    // Cheap pre-flight: refuse upfront when the client declared an
    // oversized payload (clients with honest content-length).
    const contentLength = Number(req.headers['content-length'])
    if (Number.isFinite(contentLength) && contentLength > this.maxUploadBytes) {
      res.writeHead(413).end('Payload Too Large')
      return
    }

    let received = 0
    let aborted = false
    const cap = this.maxUploadBytes

    // Backpressure-respecting stream that enforces the byte cap.
    const limiter = new (await import('stream')).Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length
        if (received > cap) {
          aborted = true
          cb(new Error('payload-too-large'))
          return
        }
        cb(null, chunk)
      },
    })

    try {
      await mkdir(dirname(target), { recursive: true })
      await pipeline(req, limiter, createWriteStream(target))
      res.writeHead(204).end()
    } catch (err) {
      // Best-effort cleanup so the disk doesn't accumulate half-written
      // files when an upload is rejected mid-stream.
      try {
        await unlink(target)
      } catch {
        // already gone
      }
      if (aborted) {
        res.writeHead(413).end('Payload Too Large')
      } else {
        // Don't leak filesystem details to the client.
        console.error('[content-server] upload failed:', err)
        res.writeHead(500).end('Upload failed')
      }
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
