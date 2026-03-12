import { pikkuSessionlessFunc } from '#pikku'

export const greeting = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }) => {
    return { message: `Hello, ${name}!` }
  },
})
