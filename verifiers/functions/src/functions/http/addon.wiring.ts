import { wireHTTP, addon, wireAddon } from '#pikku'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

wireHTTP({
  auth: false,
  method: 'get',
  route: '/addon/hello',
  func: addon('ext:hello'),
  tags: ['addon'],
})
