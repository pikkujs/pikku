import { EventSource } from 'eventsource'

const RETRY_INTERVAL = 2000

async function check() {
  try {
    console.log('🔄 Testing Server-Sent Events...')

    const serverUrl =
      process.env.HELLO_WORLD_URL_PREFIX || 'http://localhost:4002'
    const evtSource = new EventSource(`${serverUrl}/sse`, {
      withCredentials: true,
    })

    let messageCount = 0
    let testCompleted = false

    evtSource.onopen = () => {
      console.log('✅ SSE connection opened')
    }

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        messageCount++
        console.log(`📡 Message ${messageCount}:`, data)

        if (messageCount >= 3 && !testCompleted) {
          testCompleted = true
          evtSource.close()
          console.log('✅ SSE test completed successfully')
          process.exit(0)
        }
      } catch (err) {
        console.error('❌ Error parsing SSE message:', err)
      }
    }

    evtSource.onerror = (error) => {
      console.error('❌ SSE error:', error)
      evtSource.close()

      if (!testCompleted) {
        console.log('🔄 Retrying SSE connection...')
        setTimeout(check, RETRY_INTERVAL)
      }
    }

    setTimeout(() => {
      if (!testCompleted) {
        console.log('⏰ SSE connection timeout, closing...')
        evtSource.close()
        setTimeout(check, RETRY_INTERVAL)
      }
    }, 10000)
  } catch (err: any) {
    console.log(`❌ SSE test failed: ${err.message}, retrying...`)
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
