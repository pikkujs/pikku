import { resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { readSurface } from '../../utils/surface.js'
import { diffMocks, type MocksDiff } from '../mocks/diff.js'
import { readMocks } from '../mocks/read.js'
import { renderMocksDiff } from '../mocks/render.js'

export const mocksDiff = pikkuSessionlessFunc<{ all?: boolean }, MocksDiff>({
  description:
    'Compare the mocks in .mocks/ with the functions they stand in for: which RPCs are added, which have changed shape, and which mocks no longer fit their function',
  func: async ({ config }, input) => {
    const mocks = await readMocks(config.rootDir)
    const surface = readSurface(resolve(config.rootDir, config.outDir))
    return diffMocks(mocks, surface, { all: input?.all === true })
  },
})

export { renderMocksDiff }
