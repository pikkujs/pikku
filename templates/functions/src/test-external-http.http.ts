import { wireHTTP } from '../.pikku/http/pikku-http-types.gen.js'
import { hello, goodbye, echo } from '@pikku/templates-function-external'

wireHTTP({
  auth: false,
  method: 'post',
  route: '/test/external/hello',
  func: hello,
  tags: ['test', 'external'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/test/external/goodbye',
  func: goodbye,
  tags: ['test', 'external'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/test/external/echo',
  func: echo,
  tags: ['test', 'external'],
})
