import { pikkuVoidFunc } from '#pikku'

export const bootstrap = pikkuVoidFunc({
  remote: true,
  func: async ({ logger, getInspectorState }, _data, { rpc }) => {
    await getInspectorState(false, true, true)

    await rpc.invoke('pikkuFunctionTypesSplit', { bootstrap: true })
    await rpc.invoke('pikkuFunctionTypes')
    await rpc.invoke('pikkuHTTPTypes')
    await rpc.invoke('pikkuChannelTypes')
    await rpc.invoke('pikkuSchedulerTypes')
    await rpc.invoke('pikkuQueueTypes')
    await rpc.invoke('pikkuWorkflow', { bootstrap: true })
    await rpc.invoke('pikkuTriggerTypes', { bootstrap: true })
    await rpc.invoke('pikkuMCPTypes')
    await rpc.invoke('pikkuAIAgentTypes')
    await rpc.invoke('pikkuNodeTypes')
    await rpc.invoke('pikkuSecretDefinitionTypes')
    await rpc.invoke('pikkuCLITypes', { bootstrap: true })

    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
