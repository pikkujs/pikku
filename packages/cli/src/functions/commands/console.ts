import { createServer } from 'http'
import { readFile, stat } from 'fs/promises'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'

import { pikkuSessionlessFunc } from '#pikku'
import chokidar from 'chokidar'
import open from 'open'
import { pikkuDevReloader } from '@pikku/core/dev'

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

export const consoleCommand = pikkuSessionlessFunc<
  { port?: string; open?: string; hmr?: boolean },
  void
>({
  remote: true,
  func: async (
    { logger, config },
    { port, open: openBrowser, hmr },
    { rpc }
  ) => {
    const watchDirectories = [
      ...new Set(
        [config.emailTemplatesDir, ...config.srcDirectories].filter(Boolean)
      ),
    ] as string[]

    if (!config.scaffold?.console) {
      logger.error(
        'Console is not enabled. Add { "scaffold": { "console": "auth" } } to your pikku.config.json (the console requires an authenticated session — set up Better Auth)'
      )
      return
    }

    const consoleDir = join(
      fileURLToPath(import.meta.url),
      '..',
      '..',
      '..',
      '..',
      '..',
      'console-app'
    )

    const resolvedPort = parseInt(port || '51442', 10)

    try {
      await stat(consoleDir)
    } catch {
      logger.error(
        'Console app not found. Please rebuild @pikku/cli with the console app bundled.'
      )
      return
    }

    // The console bundle is built with base '/console/' (it is normally served
    // same-origin by pikku serve/dev), so this standalone server mounts it at
    // /console too and redirects the root there.
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${resolvedPort}`)

      if (!url.pathname.startsWith('/console')) {
        res.writeHead(302, { Location: '/console/' })
        res.end()
        return
      }

      const relativePath = url.pathname
        .slice('/console'.length)
        .replace(/^\/+/, '')
      let filePath = join(consoleDir, relativePath)

      try {
        const fileStat = await stat(filePath)
        if (fileStat.isDirectory()) {
          filePath = join(filePath, 'index.html')
        }
      } catch {
        filePath = join(consoleDir, 'index.html')
      }

      try {
        const content = await readFile(filePath)
        const ext = extname(filePath)
        const contentType = MIME_TYPES[ext] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      }
    })

    server.listen(resolvedPort, () => {
      logger.info(
        `Pikku Console running at http://localhost:${resolvedPort}/console`
      )
      if (openBrowser === 'true') {
        open(`http://localhost:${resolvedPort}/console`)
      }
    })

    if (hmr) {
      await pikkuDevReloader({
        srcDirectories: watchDirectories,
        logger,
      })
    }

    const configWatcher = chokidar.watch(watchDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.tsx?/,
    })

    let watcher = new chokidar.FSWatcher({})

    const generatorWatcher = () => {
      watcher.close()

      logger.info(
        `• Watching directories: \n  - ${watchDirectories.join('\n  - ')}`
      )
      watcher = chokidar.watch(watchDirectories, {
        ignoreInitial: true,
        ignored: /.*\.gen\.ts/,
      })

      watcher.on('ready', async () => {
        const handle = async () => {
          try {
            const start = Date.now()
            await rpc.invoke('all')
            logger.info({
              message: `✓ Generated in ${Date.now() - start}ms`,
              type: 'timing',
            })
          } catch (err) {
            console.error(err)
            logger.error('Error running watch')
          }
        }

        await handle()

        let timeout: ReturnType<typeof setTimeout> | undefined

        const deduped = (_file: string) => {
          if (timeout) {
            clearTimeout(timeout)
          }
          timeout = setTimeout(handle, 10)
        }

        watcher.on('change', deduped)
        watcher.on('add', deduped)
        watcher.on('unlink', deduped)
      })
    }

    configWatcher.on('ready', generatorWatcher)
    configWatcher.on('change', generatorWatcher)

    await new Promise(() => {})
  },
})
