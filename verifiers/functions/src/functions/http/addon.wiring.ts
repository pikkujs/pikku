import { wireHTTP, addon } from '#pikku'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/addon/hello',
  func: addon('ext:hello'),
  tags: ['addon'],
})
