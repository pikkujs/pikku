import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const readFunctionBody = pikkuFunc<
  { sourceFile: string; exportedName: string },
  { body: string }
>({
  title: 'Read Function Body',
  description:
    'Reads the function body (the func: async (...) => { ... } part) from a pikku function definition.',
  expose: true,
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    const body = await codeEditService.readFunctionBody(
      sourceFile,
      exportedName
    )
    return { body }
  },
})
