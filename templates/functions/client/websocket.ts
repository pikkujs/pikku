import { PikkuWebSocket } from '../.pikku/pikku-websocket.gen.js'
import { EventHubTopics } from '../types/eventhub-topics.js'
import WSWebsocket from 'ws'

export const check = async (serverUrl: string, testUserId: string) => {
  const wsUrl = serverUrl
    .replace('http://', 'ws://')
    .replace('https://', 'wss://')
  const ws = new WSWebsocket(`${wsUrl}/ws`)
  const websocket = new PikkuWebSocket<'todos-live', EventHubTopics>(ws as any)

  ws.onopen = async () => {
    console.log(`${testUserId}: WebSocket connected`)

    // Subscribe to global messages
    websocket.subscribe((data) => {
      console.log(`${testUserId}: Global message:`, data)
    })

    // Subscribe to todo events via EventHub
    websocket.subscribeToEventHub('todo-created', (data) => {
      console.log(`${testUserId}: Todo created event:`, data)
    })

    websocket.subscribeToEventHub('todo-completed', (data) => {
      console.log(`${testUserId}: Todo completed event:`, data)
    })

    const route = websocket.getRoute('action')

    // Subscribe to auth responses
    route.subscribe('auth', (data) => {
      console.log(`${testUserId}: Auth response:`, data)
    })

    // Subscribe to list responses
    route.subscribe('list', (data) => {
      console.log(`${testUserId}: List response:`, data)
    })

    // Subscribe to create responses
    route.subscribe('create', (data) => {
      console.log(`${testUserId}: Create response:`, data)
    })

    // Subscribe to complete responses
    route.subscribe('complete', (data) => {
      console.log(`${testUserId}: Complete response:`, data)
    })

    // Authenticate (using login function)
    route.send('auth', { username: 'demo', password: 'test' })

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Subscribe to todo events
    route.send('subscribe', { topic: 'todo-created' })
    route.send('subscribe', { topic: 'todo-completed' })

    await new Promise((resolve) => setTimeout(resolve, 500))

    // List todos
    route.send('list', {
      userId: 'user1',
      completed: undefined,
      priority: undefined,
      tag: undefined,
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Create a todo (this will trigger todo-created event)
    route.send('create', {
      title: `Todo from ${testUserId}`,
      priority: 'high',
      userId: 'user1',
      description: undefined,
      dueDate: undefined,
      tags: undefined,
    })

    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Close after 3 seconds
    setTimeout(() => {
      ws.onclose = () => {
        console.log(`${testUserId}: WebSocket closed`)
      }
      ws.close()
    }, 3000)
  }

  ws.onerror = (e) => {
    console.error(`${testUserId}: WebSocket error`, e)
  }
}

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
console.log('Starting WebSocket test with url:', url)

check(url, 'User1')
check(url, 'User2')
