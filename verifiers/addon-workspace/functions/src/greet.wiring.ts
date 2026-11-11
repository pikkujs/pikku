import { pikkuSessionlessFunc } from '#pikku/function'
import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

export const greetThroughAddon = pikkuSessionlessFunc<
  { name: string },
  { message: string; timestamp: number; noopCalls: number }
>({
  disabled: 'no callers found, 2026-10-20',
  func: async (_, data, { rpc }) => rpc.invoke('ext:hello', data),
})
