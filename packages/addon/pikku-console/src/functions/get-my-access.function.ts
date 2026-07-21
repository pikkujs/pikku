import { pikkuFunc } from '#pikku'

export const getMyAccess = pikkuFunc<
  null,
  { userId: string; scopes: string[] }
>({
  title: 'Get My Access',
  description:
    "Returns the caller's own user id and the scopes their session carries, so a UI can decide what to render.",
  expose: true,
  func: async (_services, _data, { session }) => {
    return {
      userId: session?.userId ?? '',
      scopes: session?.scopes ?? [],
    }
  },
})
