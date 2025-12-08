import { EventSource } from 'eventsource'

async function runSSETest() {
  console.log('Testing Server-Sent Events...')

  const serverUrl = process.env.TODO_APP_URL || 'http://localhost:4002'
  console.log('Starting HTTP SSE test with url:', serverUrl)

  const evtSource = new EventSource(`${serverUrl}/todos/stream`, {
    withCredentials: true,
  })

  let messageCount = 0
  let testCompleted = false

  evtSource.onopen = () => {
    console.log('SSE connection opened')
  }

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      messageCount++
      console.log(`Message ${messageCount}:`, data)

      if (messageCount >= 2 && !testCompleted) {
        testCompleted = true
        evtSource.close()
        console.log('SSE test completed successfully')
        process.exit(0)
      }
    } catch (err) {
      console.error('Error parsing SSE message:', err)
      evtSource.close()
      process.exit(1)
    }
  }

  evtSource.onerror = (error) => {
    console.error('SSE error:', error)
    evtSource.close()
    process.exit(1)
  }

  setTimeout(() => {
    if (!testCompleted) {
      console.log('SSE connection timeout')
      evtSource.close()
      process.exit(1)
    }
  }, 20000)
}

runSSETest()
