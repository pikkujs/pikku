// Stand-in for a method the Pikku framework declares and that takes a wire.
export const workflowService = {
  runToCompletion(_name: string, _data: unknown, _rpc: unknown): Promise<void> {
    return Promise.resolve()
  },
}
