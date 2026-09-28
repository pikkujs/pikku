import { join } from 'node:path'
import { z } from 'zod'
import { readDevAddress } from '../commands/dev-address.js'

const FALLBACK_ORIGIN = 'http://localhost:3000'

export const ConsoleUrlOutput = z.object({ consoleUrl: z.string().optional() })

/**
 * Where the console shows a knowledge file: the running dev server's address
 * when there is one, the default port otherwise. The id keeps its slashes so the
 * link reads as the path it names.
 */
export const knowledgeConsoleUrl = (
  config: { rootDir: string; runtimeDir?: string },
  path: string
): string | undefined => {
  if (!path) return undefined
  const runtimeDir = config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
  const origin = (
    readDevAddress(runtimeDir)?.apiUrl ?? FALLBACK_ORIGIN
  ).replace(/\/+$/, '')
  const id = encodeURIComponent(path).replace(/%2F/g, '/')
  return `${origin}/console/knowledge?id=${id}`
}
