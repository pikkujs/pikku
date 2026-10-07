import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readSurface } from '../../utils/surface.js'
import type { SurfaceView } from './diff.js'

const readFunctionMeta = (
  pikkuDir: string
): Record<string, { expose?: boolean }> => {
  try {
    return JSON.parse(
      readFileSync(
        join(pikkuDir, 'function', 'pikku-functions-meta.gen.json'),
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

/** The functions and schemas of a built project, with each function's `expose` flag. */
export const loadSurface = (rootDir: string, outDir: string): SurfaceView => {
  const pikkuDir = resolve(rootDir, outDir)
  const surface = readSurface(pikkuDir)
  const meta = readFunctionMeta(pikkuDir)
  return {
    functions: Object.fromEntries(
      Object.entries(surface.functions).map(([id, fn]) => [
        id,
        { ...fn, expose: meta[id]?.expose },
      ])
    ),
    schemas: surface.schemas,
  }
}
