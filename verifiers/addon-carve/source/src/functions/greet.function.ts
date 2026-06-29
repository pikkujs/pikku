import { pikkuSessionlessFunc } from '#pikku'

export const greet = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  func: async ({ logger }, { name }) => {
    logger.info(`greeting ${name}`)
    return { message: `Hello, ${name}!` }
  },
  expose: true,
})
