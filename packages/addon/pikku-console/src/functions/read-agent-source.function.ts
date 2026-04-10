import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const readAgentSource = pikkuSessionlessFunc<
  { sourceFile: string; exportedName: string },
  { config: Record<string, unknown> }
>({
  title: 'Read Agent Source',
  description:
    'Reads the source code of a pikku AI agent definition and returns its config properties.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName }) => {
    if (!codeEditService) {
      throw new MissingServiceError(
        'Code editing is only available in local development mode'
      )
    }
    return codeEditService.readAgentSource(sourceFile, exportedName)
  },
})
