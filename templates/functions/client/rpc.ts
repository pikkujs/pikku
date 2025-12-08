import { pikkuRPC } from '../.pikku/pikku-rpc.gen.js'

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuRPC.setServerUrl(url)
console.log('Starting RPC test with url:', url)

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function check() {
  try {
    const result = await pikkuRPC.invoke('ext:hello', { name: 'Pikku' })
    console.log('✅ RPC test passed:', result)
    process.exit(0)
  } catch (err: any) {
    console.log(`Still failing (${err.message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ RPC test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
