import { wireHTTP, external } from '#pikku'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/external/hello',
  func: external('ext:hello'),
  tags: ['external'],
})
