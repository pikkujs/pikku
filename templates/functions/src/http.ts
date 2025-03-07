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

addRoute({
  auth: false,
  method: 'get',
  route: '/hello-world',
  func: helloWorld,
  tags: ['hello'],
})
