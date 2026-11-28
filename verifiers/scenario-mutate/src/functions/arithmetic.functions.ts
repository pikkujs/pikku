import { pikkuSessionlessFunc } from '#pikku/function'

/** The scenario asserts on this result, so a mutant of it is caught. */
export const addNumbers = pikkuSessionlessFunc<
  { a: number; b: number },
  { sum: number }
>({
  expose: true,
  auth: true,
  func: async (_services, { a, b }) => ({ sum: a + b }),
})

/** No scenario asserts on this result, so a mutant of it survives. */
export const halveNumber = pikkuSessionlessFunc<
  { value: number },
  { half: number }
>({
  expose: true,
  auth: true,
  func: async (_services, { value }) => ({ half: value / 2 }),
})
