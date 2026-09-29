import { wireTrigger } from '#pikku/trigger/pikku-trigger-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku/function'

export const receivedPings: number[] = []

wireTrigger({
  name: 'ext:ping.sent',
  func: pikkuSessionlessFunc<{ n: number }, void>({
    func: async (_services, { n }) => {
      receivedPings.push(n)
    },
  }),
})
