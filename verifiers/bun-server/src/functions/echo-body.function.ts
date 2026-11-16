import { pikkuSessionlessFunc } from '#pikku/function'

export const echoBody = pikkuSessionlessFunc<
  { text: string },
  { length: number; text: string }
>({
  auth: false,
  func: async (_services, { text }) => ({ length: text.length, text }),
})
