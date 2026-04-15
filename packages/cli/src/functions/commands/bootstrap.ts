import { pikkuVoidFunc } from '#pikku'

export const bootstrap = pikkuVoidFunc({
  remote: true,
  func: async ({ logger, getInspectorState }, _data, { rpc }) => {
    await getInspectorState(false, false, true)

    await rpc.invoke('pikkuFunctionTypes')
    await rpc.invoke('pikkuFunctionTypesSplit')
    await rpc.invoke('pikkuHTTPTypes')
    await rpc.invoke('pikkuChannelTypes')
    await rpc.invoke('pikkuSchedulerTypes')
    await rpc.invoke('pikkuQueueTypes')
    await rpc.invoke('pikkuWorkflow')
    await rpc.invoke('pikkuMCPTypes')
    await rpc.invoke('pikkuAIAgentTypes')
    await rpc.invoke('pikkuCLITypes')

    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
