import { PikkuWebSocket } from '../.pikku/pikku-websocket.gen.js'
import { EventHubTopics } from '../src/eventhub-topics.js'

export const check = async (serverUrl: string, userId: string) => {
  let authenticationState: 'initial' | 'authenticated' | 'unauthenticated' =
    'initial'
  const websocket = new PikkuWebSocket<'events', EventHubTopics>(serverUrl)
  websocket.ws.onopen = async () => {
    console.log('Websocket connected')
    websocket.subscribe((data) => {
      console.log(`${userId}: Global message:`, data)
    })

    websocket.subscribeToEventHub('test', (data) => {
      console.log(`${userId}: EventHub message:`, data)
    })

    const route = websocket.getRoute('action')
    route.subscribe('auth', async (data) => {
      if (data.authResult === true) {
        console.log(`${userId}: User is authenticated`)
        authenticationState = 'authenticated'
      } else {
        console.log(`${userId}: User is not authenticated`)
        authenticationState = 'unauthenticated'
      }
    })

    // Authenticate user
    route.send('auth', { token: 'valid', userId })

    // Wait for authentication to be validated
    while (authenticationState === 'initial') {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Default handler
    websocket.send(`Hello from ${userId}`)

    // Route handler
    route.send('subscribe', { name: 'test' })

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Publish to everyone
    route.send('emit', { name: 'test' })

    setTimeout(() => {
      websocket.ws.onclose = () => {
        console.log(`${userId}: Websocket closed`)
      }
      websocket.ws.close()
    }, 5000)
  }

  websocket.ws.onerror = (e) => {
    console.error('Error with websocket', e)
  }
}

check('http://localhost:4002', 'Pikku User 1')
check('http://localhost:4002', 'Pikku User 2')
