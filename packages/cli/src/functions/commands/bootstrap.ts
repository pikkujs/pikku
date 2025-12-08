import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { pikkuFunctionTypes } from '../wirings/functions/pikku-command-function-types.js'
import { pikkuFunctionTypesSplit } from '../wirings/functions/pikku-command-function-types-split.js'
import { pikkuHTTPTypes } from '../wirings/http/pikku-command-http-types.js'
import { pikkuChannelTypes } from '../wirings/channels/pikku-command-channel-types.js'
import { pikkuSchedulerTypes } from '../wirings/scheduler/pikku-command-scheduler-types.js'
import { pikkuQueueTypes } from '../wirings/queue/pikku-command-queue-types.js'
import { pikkuWorkflow } from '../wirings/workflow/pikku-command-workflow.js'
import { pikkuMCPTypes } from '../wirings/mcp/pikku-command-mcp-types.js'
import { pikkuCLITypes } from '../wirings/cli/pikku-command-cli-types.js'
import { PikkuWire } from '@pikku/core'

export const bootstrap: any = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    const wire: PikkuWire = {}
    const services = { logger, config, getInspectorState }

    await getInspectorState(false, false, true)

    await pikkuFunctionTypes.func(services, null, wire)

    await pikkuFunctionTypesSplit.func(services, null, wire)
    await pikkuHTTPTypes.func(services, null, wire)
    await pikkuChannelTypes.func(services, null, wire)
    await pikkuSchedulerTypes.func(services, null, wire)
    await pikkuQueueTypes.func(services, null, wire)
    await pikkuWorkflow.func(services, null, wire)
    await pikkuMCPTypes.func(services, null, wire)
    await pikkuCLITypes.func(services, null, wire)

    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
