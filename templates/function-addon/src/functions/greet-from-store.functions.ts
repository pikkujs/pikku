import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

export const greetFromStore = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  description: 'Greets using the parent project greeting store',
  func: async ({ greetingStore }, data) => {
    return { message: greetingStore.greet(data.name) }
  },
  tags: ['addon'],
})
