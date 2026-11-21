import { fetch } from '@pikku/core/http'
import { setSingletonServices } from '@pikku/core/state'
import {
  createConfig,
  createSingletonServices,
} from './packages/app/src/services.js'
import './.pikku/pikku-bootstrap.gen.js'

const config = await createConfig()
setSingletonServices(await createSingletonServices(config))

const get = async (path: string) => {
  const response = await fetch(new Request(`http://localhost${path}`), {
    bubbleErrors: true,
  })
  if (response.status !== 200) {
    throw new Error(`GET ${path} answered ${response.status}`)
  }
  return response.json()
}

const ping = await get('/ping')
if (ping.pong !== true)
  throw new Error(`/ping returned ${JSON.stringify(ping)}`)
console.log('✓ a route of the main package answers')

const greeting = await get('/greet?name=Ada')
if (greeting.message !== 'Hello, Ada!') {
  throw new Error(`/greet returned ${JSON.stringify(greeting)}`)
}
console.log('✓ the main package reaches the addon through tools:greet')

const stamped = await get('/stamp?text=hi')
if (stamped.text !== '[stamped] hi') {
  throw new Error(`/stamp returned ${JSON.stringify(stamped)}`)
}
console.log('✓ the addon reads a service the main package provides')
