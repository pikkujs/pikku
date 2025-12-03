import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'

const start = Date.now()

async function check() {
  const TIMEOUT = 30000
  const RETRY_INTERVAL = 2000

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

const url = process.env.HELLO_WORLD_URL_PREFIX || 'http://localhost:4002'
pikkuFetch.setServerUrl(url)
console.log('Starting HTTP fetch test with url:', url)

check()
