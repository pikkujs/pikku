import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const updateFunctionBody = pikkuFunc<
  {
    sourceFile: string
    exportedName: string
    body: string
  },
  { success: boolean }
>({
  title: 'Update Function Body',
  description:
    'Replaces the function body of a pikku function definition in source code and triggers a rebuild.',
  expose: true,
  scopes: ['pikku:console:code:write'],
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
