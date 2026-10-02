import { createRequire } from 'module'
import { createServer } from 'net'
import { join } from 'path'
import { pathToFileURL } from 'url'

import type { Logger } from '@pikku/core/services'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'

export type DesignServer = { url: string; close: () => Promise<void> }

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

/** Starts the design server from `@pikku/studio` — the running Studio's, or the project's own install — and exposes its URL to the console. */
export async function startDesignServer(
  rootDir: string,
  logger: Logger
): Promise<DesignServer | undefined> {
  let entry = process.env.PIKKU_STUDIO_DESIGN
  if (!entry) {
    try {
      entry = createRequire(join(rootDir, 'package.json')).resolve(
        '@pikku/studio/design'
      )
    } catch {
      return undefined
    }
  }
  try {
    const { startDesignServer: start } = await import(pathToFileURL(entry).href)
    const server: DesignServer = await start({
      root: findWorkspaceRoot(rootDir),
      port: await freePort(),
    })
    process.env.PIKKU_DESIGN_SERVER_URL = server.url
    return server
  } catch (error) {
    logger.warn(`Design server failed to start: ${error}`)
    return undefined
  }
}
