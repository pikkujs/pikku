import { LocalEnvironmentOnlyError } from '@pikku/core/ecosystem/errors'
import { pikkuFunc } from '#pikku/function'

export const readFunctionSource = pikkuFunc<
  { sourceFile: string; exportedName: string },
  { config: Record<string, unknown>; body: string | null; wrapperName: string }
>({
  title: 'Read Function Source',
  description:
    'Reads the source code of a pikku function definition and returns its config properties and function body.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    return codeEditService.readFunctionSource(sourceFile, exportedName)
  },
})
