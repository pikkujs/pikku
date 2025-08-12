import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'
pikkuFetch.setServerUrl('http://localhost:4002')

const TIMEOUT = 30000
const RETRY_INTERVAL = 2000
const start = Date.now()

async function check() {
  try {
    const res = await pikkuFetch.fetch('/', 'GET', null)
    if (res.status === 200) {
      console.log('✅ HTTP test passed with 200 OK')

      const data = await pikkuFetch.get('/hello-world')
      console.log('Data from /hello-world', data)

      process.exit(0)
    } else {
      console.log(`Still failing (status ${res.status}), retrying...`)
    }
  } catch (err: any) {
    console.log(`Still failing (${err.message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ HTTP test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  }

  setTimeout(check, RETRY_INTERVAL)
}

check()
