import { pikkuFunc } from './list-helper.js'

export const readGone = pikkuFunc<
  { id: string },
  { id: string; tags: never[]; free: unknown }
>({
  func: async () => ({ id: 'a' }) as any,
})
