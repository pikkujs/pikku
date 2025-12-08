import { PikkuWebSocket } from '#pikku/pikku-websocket.gen.js'
import { EventHubTopics } from '../types/eventhub-topics.js'
import WSWebsocket from 'ws'

export const check = async (serverUrl: string, userId: string) => {
  let authenticationState: 'initial' | 'authenticated' | 'unauthenticated' =
    'initial'
  const ws = new WSWebsocket(serverUrl)
  const websocket = new PikkuWebSocket<'events', EventHubTopics>(ws as any)

  ws.onopen = async () => {
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

    // Default handler - intentionally sending invalid message to test error handling
    websocket.send('hello')

    // Route handler
    route.send('subscribe', { name: 'test' })

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Publish to everyone
    route.send('emit', { name: 'test' })

    setTimeout(() => {
      ws.onclose = () => {
        console.log(`${userId}: Websocket closed`)
      }
      ws.close()
    }, 5000)
  }

  ws.onerror = (e) => {
    console.error('Error with websocket', e)
  }
}

const url = process.env.HELLO_WORLD_URL_PREFIX || 'http://localhost:4002'
console.log('Starting Websocket test with url:', url)

check(url, 'Pikku User 1')
check(url, 'Pikku User 2')
