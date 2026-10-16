import { pikkuSessionlessFunc } from '#pikku/function'
import { diffMocks, type MocksDiff } from '../mocks/diff.js'
import { projectAddonMockSources } from '../mocks/addon-mocks.js'
import { loadSurface } from '../mocks/load.js'
import { readLock } from '../mocks/lock.js'
import { readMocks } from '../mocks/read.js'
import { callIndex, frontendFiles } from '../mocks/stub-scan.js'
import { scanFrontend } from '../../inspector-helpers.js'
import { renderMocksDiff } from '../mocks/render.js'

export const mocksDiff = pikkuSessionlessFunc<
  { all?: boolean; src?: string },
  MocksDiff
>({
  description:
    'Compare the mocks in .mocks/ with the functions they stand in for: which RPCs are added, which have changed shape, and which mocks no longer fit their function',
  func: async ({ config }, input) => {
    const mocks = await readMocks(
      config.rootDir,
      projectAddonMockSources(config.rootDir, config.outDir)
    )
    const surface = loadSurface(config.rootDir, config.outDir)
    const files = frontendFiles(config.rootDir, input?.src)
    return diffMocks(mocks, surface, {
      all: input?.all === true,
      lock: await readLock(config.rootDir),
      calls: files.length
        ? callIndex(
            scanFrontend(
              config.rootDir,
              files,
              config.clientFiles?.reactQueryFile
            )
          )
        : undefined,
    })
  },
})

export { renderMocksDiff }
