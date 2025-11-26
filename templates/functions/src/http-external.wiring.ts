import { wireHTTP, external } from '../.pikku/pikku-types.gen.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/external/hello',
  func: external('ext:hello'),
  tags: ['external'],
})
