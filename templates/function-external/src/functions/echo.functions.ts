import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

export const echo = pikkuSessionlessFunc<
  { text: string; repeat?: number },
  { echoed: string[]; count: number; noopCalls: number }
>({
  func: async ({ logger, noop }, data) => {
    const repeat = data.repeat || 1
    const echoed = Array.from({ length: repeat }, () => data.text)

    logger.info(`External package: Echoing "${data.text}" ${repeat} times`)

    const noopResult = noop.execute()

    return {
      echoed,
      count: echoed.length,
      noopCalls: noopResult.callCount,
    }
  },
})
