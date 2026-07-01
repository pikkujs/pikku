import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

export const editableFunc = pikkuSessionlessFunc<
  { name: string },
  { greeting: string }
>({
  title: 'Editable Function',
  description: 'A function used for e2e testing of the code editor',
  tags: ['e2e', 'editable'],
  expose: true,
  func: async (_services, { name }) => {
  return { greeting: `Hello, ${name}!` }
},
})
