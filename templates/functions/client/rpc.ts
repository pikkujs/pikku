import { pikkuRPC } from '../.pikku/pikku-rpc.gen.js'
pikkuRPC.setServerUrl('http://localhost:4002')

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function check() {
  try {
    await pikkuRPC.invoke('rpcTest', { in: 0 })
    console.log('✅ RPC test passed')
  } catch (err: any) {
    console.log(`Still failing (${err.message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ RPC test failed after ${TIMEOUT / 1000} seconds`)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
