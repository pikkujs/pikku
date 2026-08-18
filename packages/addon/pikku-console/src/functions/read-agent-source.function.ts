import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const readAgentSource = pikkuFunc<
  { sourceFile: string; exportedName: string },
  { config: Record<string, unknown> }
>({
  title: 'Read Agent Source',
  description:
    'Reads the source code of a pikku AI agent definition and returns its config properties.',
  expose: true,
  scopes: ['pikku:console:agents:read'],
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    return codeEditService.readAgentSource(sourceFile, exportedName)
  },
})
