import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const readFunctionSource = pikkuSessionlessFunc<
  { sourceFile: string; exportedName: string },
  { config: Record<string, unknown>; body: string | null; wrapperName: string }
>({
  description:
    'Reads the source code of a pikku function definition and returns its config properties and function body.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    return codeEditService.readFunctionSource(sourceFile, exportedName)
  },
})
