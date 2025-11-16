import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'

// Import command functions directly
import { pikkuFunctionTypes } from '../wirings/functions/pikku-command-function-types.js'
import { pikkuFunctionTypesSplit } from '../wirings/functions/pikku-command-function-types-split.js'
import { pikkuHTTPTypes } from '../wirings/http/pikku-command-http-types.js'
import { pikkuChannelTypes } from '../wirings/channels/pikku-command-channel-types.js'
import { pikkuSchedulerTypes } from '../wirings/scheduler/pikku-command-scheduler-types.js'
import { pikkuQueueTypes } from '../wirings/queue/pikku-command-queue-types.js'
import { pikkuWorkflowTypes } from '../wirings/workflow/pikku-command-workflow-types.js'
import { pikkuMCPTypes } from '../wirings/mcp/pikku-command-mcp-types.js'
import { pikkuCLITypes } from '../wirings/cli/pikku-command-cli-types.js'
import { PikkuInteraction } from '@pikku/core'

export const bootstrap: any = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    const interaction: PikkuInteraction = {}
    const services = { logger, config, getInspectorState }

    // Initialize inspector state in bootstrap mode with core types only
    // This allows bootstrap to run immediately without inspecting the codebase
    // All subsequent RPC commands will use this cached state
    await getInspectorState(false, false, true)

    await pikkuFunctionTypes.func(services, null, interaction)

    // Generate wiring-specific type files for tree-shaking
    // These use the bootstrap mode state with core types
    await pikkuFunctionTypesSplit.func(services, null, interaction)
    await pikkuHTTPTypes.func(services, null, interaction)
    await pikkuChannelTypes.func(services, null, interaction)
    await pikkuSchedulerTypes.func(services, null, interaction)
    await pikkuQueueTypes.func(services, null, interaction)
    await pikkuWorkflowTypes.func(services, null, interaction)
    await pikkuMCPTypes.func(services, null, interaction)
    await pikkuCLITypes.func(services, null, interaction)

    // Check for critical errors and exit if any were logged
    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
