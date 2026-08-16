import { ref, wireAddon } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

wireHTTP({
  auth: false,
  method: 'get',
  route: '/addon/hello',
  func: ref('ext:hello'),
  tags: ['addon'],
})
