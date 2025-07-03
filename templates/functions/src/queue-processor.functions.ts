import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const queueProcessor = pikkuSessionlessFunc<
  { message: string; fail: boolean },
  { result: string }
>(async ({}, data) => {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (data.fail) {
    throw new Error('Job failed because it was instructed to')
  }
  return { result: `echo: ${data.message}` }
})
