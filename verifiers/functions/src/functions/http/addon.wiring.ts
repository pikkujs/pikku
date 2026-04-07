import { wireHTTP, func, wireAddon } from '#pikku'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

wireHTTP({
  auth: false,
  method: 'get',
  route: '/addon/hello',
  func: func('ext:hello'),
  tags: ['addon'],
})
