import { pikkuSessionlessFunc } from '#pikku'

export const readFunctionSource = pikkuSessionlessFunc<
  { sourceFile: string; exportedName: string },
  { config: Record<string, unknown>; body: string | null; wrapperName: string }
>({
  title: 'Read Function Source',
  description:
    'Reads the source code of a pikku function definition and returns its config properties and function body.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new Error(
        'Code editing is only available in local development mode'
      )
    }
    return codeEditService.readFunctionSource(sourceFile, exportedName)
  },
})
