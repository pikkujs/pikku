import { wireHTTP } from '#pikku/http'
import { failingStream } from './sse-error.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/sse-error',
  func: failingStream,
  sse: true,
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/sse-agui-error',
  func: failingStream,
  sse: true,
  streamProtocol: 'agui',
})
