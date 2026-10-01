import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { createServer } from 'net'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'

import type { Logger } from '@pikku/core/services'

export type DesignServer = { url: string; close: () => Promise<void> }

/** The workspace root the design server renders: the nearest ancestor declaring `workspaces`. */
function workspaceRoot(rootDir: string): string {
  let dir = rootDir
  while (true) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      if (pkg.workspaces) return dir
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) return rootDir
    dir = parent
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
    })
  })
}

/** Starts `@pikku/design-server` when the project has it installed, and exposes its URL to the console. */
export async function startDesignServer(
  rootDir: string,
  logger: Logger
): Promise<DesignServer | undefined> {
  let entry: string
  try {
    entry = createRequire(join(rootDir, 'package.json')).resolve(
      '@pikku/design-server'
    )
  } catch {
    return undefined
  }
  try {
    const { startDesignServer: start } = await import(pathToFileURL(entry).href)
    const server: DesignServer = await start({
      root: workspaceRoot(rootDir),
      port: await freePort(),
    })
    process.env.PIKKU_DESIGN_SERVER_URL = server.url
    return server
  } catch (error) {
    logger.warn(`Design server failed to start: ${error}`)
    return undefined
  }
}
