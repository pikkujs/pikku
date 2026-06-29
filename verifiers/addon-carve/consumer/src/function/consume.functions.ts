import { pikkuSessionlessFunc, wireAddon } from '#pikku'

// Wire the addons carved out of the source project. The consumer calls their
// functions via RPC, type-checked against each addon's published surface.
wireAddon({ name: 'greeter', package: '@pikku/addon-greeter' })
wireAddon({ name: 'farewell', package: '@pikku/addon-farewell' })
wireAddon({ name: 'dbpost', package: '@pikku/addon-dbpost' })
wireAddon({ name: 'notifyaddon', package: '@pikku/addon-notifyaddon' })

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

// The carved DB addon: the consumer calls it via RPC, type-checked against the
// addon's published surface (which is scoped to the tables it owns).
export const consumeCreatePost = pikkuSessionlessFunc<
  { title: string; authorId: string },
  { id: string }
>({
  func: async (_services, data, { rpc }) => {
    return await rpc.invoke('dbpost:createPost', data)
  },
})

// The multi-service addon: uses kysely + two user-defined services, carved with
// their types. The consumer is type-checked against its published surface.
export const consumeNotify = pikkuSessionlessFunc<
  { postId: string },
  { sentAt: string }
>({
  func: async (_services, data, { rpc }) => {
    return await rpc.invoke('notifyaddon:notifyAuthor', data)
  },
})
