import { createServer } from 'http'
import { readFile, stat } from 'fs/promises'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'

import type { Logger } from '@pikku/core/services'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

export function resolveConsoleDir(): string {
  return join(
    fileURLToPath(import.meta.url),
    '..',
    '..',
    '..',
    '..',
    '..',
    'console-app'
  )
}

export async function startConsoleServer(
  consoleFlag: string | boolean,
  hostname: string,
  logger: Logger
): Promise<ReturnType<typeof createServer> | undefined> {
  const consoleDir = resolveConsoleDir()
  const consolePort =
    typeof consoleFlag === 'string' ? parseInt(consoleFlag, 10) : 51442

  try {
    await stat(consoleDir)
  } catch {
    logger.error(
      'Console app not found. Please rebuild @pikku/cli with the console app bundled.'
    )
    return undefined
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${consolePort}`)
    let filePath = join(consoleDir, url.pathname)
    try {
      const s = await stat(filePath)
      if (s.isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      filePath = join(consoleDir, 'index.html')
    }
    try {
      const content = await readFile(filePath)
      const contentType =
        MIME_TYPES[extname(filePath)] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(consolePort, () => {
      logger.info(`Pikku Console running at http://${hostname}:${consolePort}`)
      resolve()
    })
    server.on('error', reject)
  })

  return server
}
