import { pikkuVoidFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'
import type { CoreSingletonServices } from '@pikku/core'

export const all = pikkuVoidFunc({
  remote: true,
  func: async (services, _data, { rpc }) => {
    // Ensure singleton services are in global state for workflow runner
    if (!pikkuState(null, 'package', 'singletonServices')) {
      pikkuState(
        null,
        'package',
        'singletonServices',
        services as unknown as CoreSingletonServices
      )
    }
    await services.workflowService!.runToCompletion('allWorkflow', {}, rpc)
  },
})
