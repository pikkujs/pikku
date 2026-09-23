import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { refCLI, refChannel, refHTTP } from '#pikku/function'
import { RPCNotFoundError, rpcService } from '@pikku/core/rpc'
import { createConfig, createSingletonServices } from './services.js'

const ADDON_PACKAGE = '@pikku/templates-function-addon'

const callable = (config: any): unknown =>
  typeof config === 'function' ? config : config?.func

const readMeta = (relativePath: string): any => {
  const url = new URL(relativePath, import.meta.url)
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
}

const httpMeta = readMeta('../.pikku/http/pikku-http-wirings-meta.gen.json')
const channelMeta = readMeta('../.pikku/channel/pikku-channels-meta.gen.json')
const cliMeta = readMeta('../.pikku/cli/pikku-cli-wirings-meta.gen.json')

console.log('\nAddon Contract Metadata Verifier')
console.log('=========================')
console.log(
  '\nThis verifier tests that contracts published by an addon are consumed across the package boundary and tagged with the addon packageName.\n'
)

let passed = true

const httpEntry = httpMeta?.get?.['/api/ext/hello']
if (httpEntry?.packageName === ADDON_PACKAGE) {
  console.log(
    `✓ HTTP route resolved from addon contract (packageName: ${httpEntry.packageName})`
  )
} else {
  console.log(
    `✗ HTTP route did not resolve from addon contract — got: ${JSON.stringify(httpEntry)}`
  )
  passed = false
}

const channelEntry = channelMeta?.['ext-events']?.messageWirings?.action?.hello
if (channelEntry?.packageName === ADDON_PACKAGE) {
  console.log(
    `✓ Channel route resolved from addon contract (packageName: ${channelEntry.packageName})`
  )
} else {
  console.log(
    `✗ Channel route did not resolve from addon contract — got: ${JSON.stringify(channelEntry)}`
  )
  passed = false
}

const cliEntry = cliMeta?.programs?.['addon-cli']?.commands?.hello
if (cliEntry?.packageName === ADDON_PACKAGE) {
  console.log(
    `✓ CLI command resolved from addon contract (packageName: ${cliEntry.packageName})`
  )
} else {
  console.log(
    `✗ CLI command did not resolve from addon contract — got: ${JSON.stringify(cliEntry)}`
  )
  passed = false
}

// Runtime model: refHTTP/refChannel/refCLI must return real wiring objects
// whose functions are ref() RPC proxies — not inert markers. A meta-only
// assertion would pass even if the helpers returned nothing usable at runtime.
const httpFunc = callable(
  (refHTTP('ext:helloRoutes') as any).routes?.hello?.func
)
if (typeof httpFunc === 'function') {
  console.log('✓ refHTTP returns a live route bound to a ref() proxy')
} else {
  console.log(
    `✗ refHTTP did not return a live route — got: ${JSON.stringify(refHTTP('ext:helloRoutes'))}`
  )
  passed = false
}

const channelFunc = callable(
  (refChannel('ext:helloChannel') as any).hello?.func
)
if (typeof channelFunc === 'function') {
  console.log('✓ refChannel returns a live action bound to a ref() proxy')
} else {
  console.log(
    `✗ refChannel did not return a live action — got: ${JSON.stringify(refChannel('ext:helloChannel'))}`
  )
  passed = false
}

const cliFunc = callable((refCLI('ext:helloCommands') as any).hello?.func)
if (typeof cliFunc === 'function') {
  console.log('✓ refCLI returns a live command bound to a ref() proxy')
} else {
  console.log(
    `✗ refCLI did not return a live command — got: ${JSON.stringify(refCLI('ext:helloCommands'))}`
  )
  passed = false
}

const overridden = refHTTP('ext:helloRoutes', { basePath: '/custom' }) as any
if (overridden.basePath === '/custom') {
  console.log('✓ refHTTP basePath override applies')
} else {
  console.log(
    `✗ refHTTP basePath override failed — got: ${JSON.stringify(overridden.basePath)}`
  )
  passed = false
}

// `mcp: ['goodbye']` is the app choosing the tool menu: the addon declared
// `hello` a tool and not `goodbye`, and neither declaration decides this.
const mcpMeta = readMeta('../.pikku/mcp/mcp.gen.json')
const toolNames = (mcpMeta?.tools ?? []).map((tool: any) => tool.name).sort()
if (toolNames.length === 1 && toolNames[0] === 'ext:goodbye') {
  console.log('✓ wireAddon mcp list offers exactly the tools it names')
} else {
  console.log(
    `✗ wireAddon mcp list did not decide the tool menu — got: ${JSON.stringify(toolNames)}`
  )
  passed = false
}

// `expose: ['goodbye']` is the app choosing what `rpc.exposed` — and so
// `POST /rpc/:rpcName` — reaches. Neither function declared `expose: true`.
const rpc = rpcService.getContextRPCService(
  (await createSingletonServices(await createConfig())) as any,
  {}
)
try {
  const reply: any = await rpc.exposed('ext:goodbye', { name: 'Ada' })
  if (reply?.message === 'Goodbye, Ada!') {
    console.log('✓ wireAddon expose list makes a listed function callable')
  } else {
    console.log(`✗ ext:goodbye returned ${JSON.stringify(reply)}`)
    passed = false
  }
} catch (error: any) {
  console.log(
    `✗ wireAddon expose list did not open ext:goodbye — ${error.message}`
  )
  passed = false
}
try {
  await rpc.exposed('ext:hello', { name: 'Ada' })
  console.log('✗ ext:hello was callable though the expose list omits it')
  passed = false
} catch (error) {
  if (error instanceof RPCNotFoundError) {
    console.log(
      '✓ wireAddon expose list keeps an unlisted function unreachable'
    )
  } else {
    console.log(
      `✗ ext:hello failed for the wrong reason — ${(error as Error).message}`
    )
    passed = false
  }
}

console.log('\n───────────────────────────────────────')
if (passed) {
  console.log('✓ All addon contract assertions passed!')
} else {
  console.log('✗ Some addon contract assertions failed!')
  process.exit(1)
}
