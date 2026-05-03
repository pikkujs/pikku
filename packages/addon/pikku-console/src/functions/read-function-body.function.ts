import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const readFunctionBody = pikkuSessionlessFunc<
  { sourceFile: string; exportedName: string },
  { body: string }
>({
  description:
    'Reads the function body (the func: async (...) => { ... } part) from a pikku function definition.',
  expose: true,
  auth: false,
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
