import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SurfaceDoc } from './surface-doc.types.js'

/** The name the doc is published under, inside the `@pikku/cli` package. */
export const SURFACE_DOC_FILE = 'surface.json'

/**
 * Where the shipped surface doc lives. It sits at the root of the `@pikku/cli`
 * package, so a consumer outside this repository resolves it as
 * `@pikku/cli/surface.json` — from in here the package root has to be walked to,
 * because this module runs both from `src` and from `dist/src`.
 */
export const shippedSurfaceDocPath = (): string | null => {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    // The first package.json above this module is the CLI's own, whether it is
    // running from `src` or from `dist/src`. Stopping there rather than looking
    // for the file itself keeps the search from wandering into a consumer's
    // project and finding an unrelated surface.json.
    if (existsSync(join(directory, 'package.json'))) {
      const path = join(directory, SURFACE_DOC_FILE)
      return existsSync(path) ? path : null
    }
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

/**
 * The doc is built with the CLI, so a CLI running out of a source checkout that
 * has never been built has none. That is a reason to skip seeding the usage
 * overlay, not a reason to fail a prebuild.
 */
export const readShippedSurfaceDoc = (): SurfaceDoc | null => {
  const path = shippedSurfaceDocPath()
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SurfaceDoc
  } catch {
    return null
  }
}
