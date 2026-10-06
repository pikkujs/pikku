import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { readSurface } from '../../utils/surface.js'
import { diffMocks, type MocksDiff } from '../mocks/diff.js'
import { readMocks } from '../mocks/read.js'
import { renderMocksDiff } from '../mocks/render.js'

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

export const mocksDiff = pikkuSessionlessFunc<{ all?: boolean }, MocksDiff>({
  description:
    'Compare the mocks in .mocks/ with the functions they stand in for: which RPCs are added, which have changed shape, and which mocks no longer fit their function',
  func: async ({ config }, input) => {
    const mocks = await readMocks(config.rootDir)
    const pikkuDir = resolve(config.rootDir, config.outDir)
    const surface = readSurface(pikkuDir)
    const meta = readFunctionMeta(pikkuDir)
    const functions = Object.fromEntries(
      Object.entries(surface.functions).map(([id, fn]) => [
        id,
        {
          ...fn,
          expose: meta[id]?.expose,
        },
      ])
    )
    return diffMocks(
      mocks,
      { functions, schemas: surface.schemas },
      { all: input?.all === true }
    )
  },
})

export { renderMocksDiff }
