import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const readAgentSource = pikkuFunc<
  { sourceFile: string; exportedName: string },
  { config: Record<string, unknown> }
>({
  title: 'Read Agent Source',
  description:
    'Reads the source code of a pikku AI agent definition and returns its config properties.',
  expose: true,
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    return codeEditService.readAgentSource(sourceFile, exportedName)
  },
})
