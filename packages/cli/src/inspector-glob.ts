import * as path from 'path'
import { glob } from 'tinyglobby'
import { InspectorFilters, InspectorState, inspect } from '@pikku/inspector'
import { logCommandInfoAndTime } from './utils.js'

export const inspectorGlob = async (
  logger,
  rootDir: string,
  srcDirectories: string[],
  filters: InspectorFilters
) => {
  let result: InspectorState
  await logCommandInfoAndTime(
    logger,
    'Inspecting codebase',
    'Inspected codebase',
    [false],
    async () => {
      const wiringFiles = (
        await Promise.all(
          srcDirectories.map((dir) =>
            glob(`${path.join(rootDir, dir)}/**/*.ts`)
          )
        )
      ).flat()
      result = await inspect(logger, wiringFiles, filters)
    }
  )
  return result!
}
