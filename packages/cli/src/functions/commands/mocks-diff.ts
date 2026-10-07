import { resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { diffMocks, type MocksDiff } from '../mocks/diff.js'
import { loadSurface } from '../mocks/load.js'
import { readLock } from '../mocks/lock.js'
import { readMocks } from '../mocks/read.js'
import { callIndex, frontendRoots, scanFrontend } from '../mocks/stub-scan.js'
import { renderMocksDiff } from '../mocks/render.js'

export const mocksDiff = pikkuSessionlessFunc<
  { all?: boolean; src?: string },
  MocksDiff
>({
  description:
    'Compare the mocks in .mocks/ with the functions they stand in for: which RPCs are added, which have changed shape, and which mocks no longer fit their function',
  func: async ({ config }, input) => {
    const mocks = await readMocks(config.rootDir)
    const surface = loadSurface(config.rootDir, config.outDir)
    const roots = input?.src
      ? input.src.split(',').map((dir) => resolve(config.rootDir, dir.trim()))
      : frontendRoots(config.rootDir)
    return diffMocks(mocks, surface, {
      all: input?.all === true,
      lock: await readLock(config.rootDir),
      calls: roots.length
        ? callIndex(scanFrontend(config.rootDir, roots))
        : undefined,
    })
  },
})

export { renderMocksDiff }
