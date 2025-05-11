import {
  type APIFunctionSessionless,
  addRoute,
} from '../.pikku/pikku-types.gen.js'

export const helloWorld: APIFunctionSessionless<
  void,
  'Hello world!'
> = async () => {
  return 'Hello world!'
}

const pikkuFunc = <In, Out = unknown>(func: any) => {
  return func
}

export const helloWorld2 = pikkuFunc<{ same: string }>(async () => {
  return 'Hello world!' as const
})

pikkuFunc<{ same: string }>({
  func: async () => {
    return 'Hello world!' as const
  },
  name: 'bobs'
})

addRoute({
  auth: false,
  method: 'get',
  route: '/hello-world',
  func: helloWorld,
  tags: ['hello'],
})
