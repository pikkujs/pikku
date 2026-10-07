import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { readSurface } from '../../utils/surface.js'
import { diffMocks, type MocksDiff } from '../mocks/diff.js'
import { readMocks } from '../mocks/read.js'
import { callIndex, frontendRoots, scanFrontend } from '../mocks/stub-scan.js'
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

export const mocksDiff = pikkuSessionlessFunc<
  { all?: boolean; src?: string },
  MocksDiff
>({
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
    const roots = input?.src
      ? input.src.split(',').map((dir) => resolve(config.rootDir, dir.trim()))
      : frontendRoots(config.rootDir)
    return diffMocks(
      mocks,
      { functions, schemas: surface.schemas },
      {
        all: input?.all === true,
        calls: roots.length
          ? callIndex(scanFrontend(config.rootDir, roots))
          : undefined,
      }
    )
  },
})

export { renderMocksDiff }
