import { pikkuSessionlessFunc } from '#pikku/function'

export const ping = pikkuSessionlessFunc<void, { pong: true }>({
  expose: true,
  auth: false,
  func: async () => ({ pong: true }),
})

export const tick = pikkuSessionlessFunc<void, void>({
  func: async () => {},
})

export const greetVia = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }, { rpc }) =>
    rpc.invoke('tools:greet', { name }),
})
