import { pikkuSessionlessFunc } from '#pikku/function'

const invocations: Array<{ data: any; pikkuUserId?: string }> = []
export const getInvocations = () => invocations
export const clearInvocations = () => {
  invocations.length = 0
}

export const triggerTargetHandler = pikkuSessionlessFunc<{ payload: string }>({
  func: async ({ logger }, data, { pikkuUserId }) => {
    invocations.push({ data, ...(pikkuUserId ? { pikkuUserId } : {}) })
    logger.info(`Trigger target received: ${data.payload}`)
    return data
  },
  remote: true,
})
