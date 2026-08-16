import { LocalEnvironmentOnlyError } from '#pikku/error'
import { pikkuFunc } from '#pikku/function'
import type { AgentConfigChanges } from '../services/code-edit.service.js'

export const updateAgentConfig = pikkuFunc<
  {
    sourceFile: string
    exportedName: string
    changes: AgentConfigChanges
  },
  { success: boolean }
>({
  title: 'Update Agent Config',
  description:
    'Updates the config properties of a pikku AI agent definition in source code and triggers a rebuild.',
  expose: true,
  scopes: ['pikku:console:agents:manage'],
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
