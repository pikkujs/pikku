import { wireHTTP, wireAddon, ref } from '#pikku'
import { testAddonHello } from './test-addon-hello.function.js'
import { testAddonGoodbye } from './test-addon-goodbye.function.js'
import { noAddonPing } from './no-addon-ping.function.js'
import { mixedAddonCaller, mixedPlain } from './mixed-file.functions.js'

wireAddon({ name: 'ext', package: '@pikku/templates-function-addon' })

wireHTTP({
  auth: false,
  method: 'post',
  route: '/treeshake/hello',
  func: testAddonHello,
  tags: ['treeshake'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/treeshake/goodbye',
  func: testAddonGoodbye,
  tags: ['treeshake'],
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/treeshake/ping',
  func: noAddonPing,
  tags: ['treeshake'],
})

// ref()-wired addon function using exactly one parent service — the unit
// keeping this route must import the addon and require greetingStore but
// NOT auditSink.
wireHTTP({
  auth: false,
  method: 'post',
  route: '/treeshake/greet-from-store',
  func: ref('ext:greetFromStore'),
  tags: ['treeshake'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/treeshake/mixed-caller',
  func: mixedAddonCaller,
  tags: ['treeshake'],
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/treeshake/mixed-plain',
  func: mixedPlain,
  tags: ['treeshake'],
})
