import { pikkuVoidFunc } from '#pikku'

// TODO: is this being use anywhere?
export const bootstrap = pikkuVoidFunc({
  internal: true,
  func: async ({ logger, getInspectorState }, _data, { rpc }) => {
    await getInspectorState(false, false, true)

    await rpc.invoke('pikkuFunctionTypes', null)
    await rpc.invoke('pikkuFunctionTypesSplit', null)
    await rpc.invoke('pikkuHTTPTypes', null)
    await rpc.invoke('pikkuChannelTypes', null)
    await rpc.invoke('pikkuSchedulerTypes', null)
    await rpc.invoke('pikkuQueueTypes', null)
    await rpc.invoke('pikkuWorkflow', null)
    await rpc.invoke('pikkuMCPTypes', null)
    await rpc.invoke('pikkuCLITypes', null)

    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
