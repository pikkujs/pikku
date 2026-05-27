import { pikkuRPC } from '../.pikku/pikku-rpc.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuRPC.setServerUrl(url)
console.log('Starting runtime RPC test with url:', url)

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function check() {
  try {
    const result = await pikkuRPC.invoke('greet', {
      name: 'Pikku',
      greeting: 'Hello',
    })

    if (!result.message?.includes('Hello, Pikku!')) {
      throw new Error(`Unexpected RPC response: ${JSON.stringify(result)}`)
    }

    console.log('✅ Runtime RPC test passed:', result)
    process.exit(0)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`Still failing (${message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ Runtime RPC test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  }

  setTimeout(check, RETRY_INTERVAL)
}

check()
