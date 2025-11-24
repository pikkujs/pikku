import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'
import type {
  HelloInput,
  HelloOutput,
  GoodbyeInput,
  GoodbyeOutput,
  EchoInput,
  EchoOutput,
} from '@pikku/templates-function-external/types'

export const testExternalHello = pikkuSessionlessFunc<HelloInput, HelloOutput>({
  func: async ({}, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})

export const testExternalGoodbye = pikkuSessionlessFunc<
  GoodbyeInput,
  GoodbyeOutput
>({
  func: async ({}, data, { rpc }) => {
    return await rpc.invoke('ext:goodbye', data)
  },
})

export const testExternalEcho = pikkuSessionlessFunc<EchoInput, EchoOutput>({
  func: async ({}, data, { rpc }) => {
    return await rpc.invoke('ext:echo', data)
  },
})
