import { pikkuSessionlessFunc } from '#pikku'

export const readFunctionBody = pikkuSessionlessFunc<
  { sourceFile: string; exportedName: string },
  { body: string }
>({
  title: 'Read Function Body',
  description:
    'Reads the function body (the func: async (...) => { ... } part) from a pikku function definition.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new Error(
        'Code editing is only available in local development mode'
      )
    }
    const body = await codeEditService.readFunctionBody(
      sourceFile,
      exportedName
    )
    return { body }
  },
})
