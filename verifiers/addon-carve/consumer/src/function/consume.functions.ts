import { pikkuSessionlessFunc, wireAddon } from '#pikku'

// Wire the addons carved out of the source project. The consumer calls their
// functions via RPC, type-checked against each addon's published surface.
wireAddon({ name: 'greeter', package: '@pikku/addon-greeter' })
wireAddon({ name: 'farewell', package: '@pikku/addon-farewell' })

export type ConsumeInput = { name: string }
export type ConsumeOutput = { message: string }

export const consumeGreet = pikkuSessionlessFunc<ConsumeInput, ConsumeOutput>({
  func: async (_services, data, { rpc }) => {
    return await rpc.invoke('greeter:greet', data)
  },
})

export const consumeFarewell = pikkuSessionlessFunc<ConsumeInput, ConsumeOutput>(
  {
    func: async (_services, data, { rpc }) => {
      return await rpc.invoke('farewell:farewell', data)
    },
  }
)
