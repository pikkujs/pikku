import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import type { AgentConfigChanges } from '../services/code-edit.service.js'

export const updateAgentConfig = pikkuSessionlessFunc<
  {
    sourceFile: string
    exportedName: string
    changes: AgentConfigChanges
  },
  { success: boolean }
>({
  description:
    'Updates the config properties of a pikku AI agent definition in source code and triggers a rebuild.',
  expose: true,
  auth: false,
  func: async ({ codeEditService }, { sourceFile, exportedName, changes }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    await codeEditService.updateAgentConfig(sourceFile, exportedName, changes)
    return { success: true }
  },
})
