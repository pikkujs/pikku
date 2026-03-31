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
  title: 'Update Function Config',
  description:
    'Updates the config properties of a pikku function definition in source code and triggers a rebuild.',
  expose: true,
  auth: false,
  func: async (
    { codeEditService },
    { sourceFile, exportedName, changes },
    { rpc }
  ) => {
    if (!codeEditService) {
      throw new Error(
        'Code editing is only available in local development mode'
      )
    }
    await codeEditService.updateFunctionConfig(
      sourceFile,
      exportedName,
      changes
    )
    await (rpc as any).invoke('all', null)
    return { success: true }
  },
})
