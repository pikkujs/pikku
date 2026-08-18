import { pikkuSessionlessFunc } from '#pikku/addon/function'

export const goodbye = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  description: 'Sends a farewell message',
  func: async ({ logger }, data) => {
    const message = `Goodbye, ${data.name}!`
    logger.info(`Addon: ${message}`)
    return { message }
  },
  tags: ['addon'],
})
