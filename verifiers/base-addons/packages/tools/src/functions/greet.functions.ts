import { pikkuSessionlessFunc } from '#pikku/function'

export const greet = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  expose: true,
  auth: false,
  func: async (_services, { name }) => ({ message: `Hello, ${name}!` }),
})

export const hidden = pikkuSessionlessFunc<void, { ok: true }>({
  func: async () => ({ ok: true }),
})
