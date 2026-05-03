import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import type { FunctionConfigChanges } from '../services/code-edit.service.js'

export const updateFunctionConfig = pikkuSessionlessFunc<
  {
    sourceFile: string
    exportedName: string
    changes: FunctionConfigChanges
  },
  { success: boolean }
>({
  description:
    'Updates the config properties of a pikku function definition in source code and triggers a rebuild.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName, changes }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    await codeEditService.updateFunctionConfig(
      sourceFile,
      exportedName,
      changes
    )
    return { success: true }
  },
})
