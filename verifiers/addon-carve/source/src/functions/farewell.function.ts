import { pikkuSessionlessFunc } from '#pikku'

export const farewell = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  func: async ({ logger }, { name }) => {
    logger.info(`bidding farewell to ${name}`)
    return { message: `Goodbye, ${name}!` }
  },
  expose: true,
})
