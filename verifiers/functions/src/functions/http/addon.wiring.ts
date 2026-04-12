import { wireHTTP, ref, wireAddon } from '#pikku'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

wireHTTP({
  auth: false,
  method: 'get',
  route: '/addon/hello',
  func: ref('ext:hello'),
  tags: ['addon'],
})
