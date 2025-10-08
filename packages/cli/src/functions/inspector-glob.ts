import * as path from 'path'
import { glob } from 'tinyglobby'
import { InspectorFilters, InspectorState, inspect } from '@pikku/inspector'
import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { logCommandInfoAndTime } from '../middleware/log-command-info-and-time.js'

interface InspectorGlobInput {
  rootDir: string
  srcDirectories: string[]
  filters: InspectorFilters
}

export const inspectorGlob = pikkuSessionlessFunc<
  InspectorGlobInput,
  InspectorState
>({
  func: async ({ logger }, data) => {
    const { rootDir, srcDirectories, filters } = data

    const wiringFiles = (
      await Promise.all(
        srcDirectories.map((dir) => glob(`${path.join(rootDir, dir)}/**/*.ts`))
      )
    ).flat()

    return await inspect(logger, wiringFiles, filters)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Inspecting codebase',
      commandEnd: 'Inspected codebase',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
