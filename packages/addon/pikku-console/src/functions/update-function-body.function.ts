import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const updateFunctionBody = pikkuSessionlessFunc<
  {
    sourceFile: string
    exportedName: string
    body: string
  },
  { success: boolean }
>({
  description:
    'Replaces the function body of a pikku function definition in source code and triggers a rebuild.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName, body }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    await codeEditService.updateFunctionBody(sourceFile, exportedName, body)
    return { success: true }
  },
})
