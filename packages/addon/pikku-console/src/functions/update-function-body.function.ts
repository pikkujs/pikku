import { pikkuSessionlessFunc } from '#pikku'

export const updateFunctionBody = pikkuSessionlessFunc<
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
  auth: false,
  func: async (
    { codeEditService },
    { sourceFile, exportedName, body },
    { rpc }
  ) => {
    if (!codeEditService) {
      throw new Error(
        'Code editing is only available in local development mode'
      )
    }
    await codeEditService.updateFunctionBody(sourceFile, exportedName, body)
    await (rpc as any).invoke('all', null)
    return { success: true }
  },
})
