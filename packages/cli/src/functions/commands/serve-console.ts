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

/**
 * The dev servers serve the bundled console app same-origin at `/console`,
 * so auth cookies are first-party and the console needs no `?server=` param.
 * Returns undefined when the CLI build has no console app bundled.
 */
export async function resolveConsoleMount(): Promise<StaticMount | undefined> {
  const consoleDir = resolveConsoleDir()
  try {
    await stat(join(consoleDir, 'index.html'))
  } catch {
    return undefined
  }
  return { urlPrefix: '/console', directory: consoleDir, spaFallback: true }
}
