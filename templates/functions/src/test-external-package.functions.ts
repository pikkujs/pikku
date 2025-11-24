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

export const testExternalAll = pikkuSessionlessFunc<
  Record<string, never>,
  { hello: HelloOutput; goodbye: GoodbyeOutput; echo: EchoOutput }
>({
  func: async ({}, _data, { rpc }) => {
    const hello = await rpc.invoke('ext:hello', {
      name: 'World',
    })

    const goodbye = await rpc.invoke('ext:goodbye', {
      name: 'Friend',
      farewell: 'See you later',
    })

    const echo = await rpc.invoke('ext:echo', {
      text: 'Testing external package',
      repeat: 3,
    })

    return { hello, goodbye, echo }
  },
})
