import { stat } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'

import type { StaticMount } from '@pikku/node-http-server'

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

export async function resolveConsoleMount(): Promise<StaticMount | undefined> {
  const consoleDir = resolveConsoleDir()
  try {
    await stat(join(consoleDir, 'index.html'))
  } catch {
    return undefined
  }
  return { urlPrefix: '/console', directory: consoleDir, spaFallback: true }
}
