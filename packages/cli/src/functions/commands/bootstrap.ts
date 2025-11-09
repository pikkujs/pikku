import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'

export const bootstrap: any = pikkuVoidFunc({
  func: async ({ logger, config, rpc, getInspectorState }) => {
    // Initialize inspector state in bootstrap mode with core types only
    // This allows bootstrap to run immediately without inspecting the codebase
    // All subsequent RPC commands will use this cached state
    await getInspectorState(false, false, true)

    await rpc.invoke('pikkuFunctionTypes', null)

    // Generate wiring-specific type files for tree-shaking
    // These use the bootstrap mode state with core types
    await rpc.invoke('pikkuFunctionTypesSplit', null)
    await rpc.invoke('pikkuHTTPTypes', null)
    await rpc.invoke('pikkuChannelTypes', null)
    await rpc.invoke('pikkuSchedulerTypes', null)
    await rpc.invoke('pikkuQueueTypes', null)
    await rpc.invoke('pikkuWorkflowTypes', null)
    await rpc.invoke('pikkuMCPTypes', null)
    await rpc.invoke('pikkuCLITypes', null)

    // Check for critical errors and exit if any were logged
    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
