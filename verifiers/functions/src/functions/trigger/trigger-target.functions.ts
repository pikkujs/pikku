import { pikkuSessionlessFunc } from '#pikku'

const invocations: Array<{ data: any }> = []
export const getInvocations = () => invocations

export const triggerTargetHandler = pikkuSessionlessFunc<{ payload: string }>({
  func: async ({ logger }, data) => {
    invocations.push({ data })
    logger.info(`Trigger target received: ${data.payload}`)
    return data
  },
  internal: true,
})
