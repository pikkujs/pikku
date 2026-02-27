import { PikkuWebSocket } from '../.pikku/pikku-websocket.gen.js'
import type { EventHubTopics } from '../types/eventhub-topics.js'
import WSWebsocket from 'ws'

export const check = async (serverUrl: string, testUserId: string) => {
  const wsPath = process.env.WS_PATH ?? ''
  const wsUrl = serverUrl
    .replace('http://', 'ws://')
    .replace('https://', 'wss://')
  const ws = new WSWebsocket(`${wsUrl}${wsPath}`)
  const websocket = new PikkuWebSocket<'todos-live', EventHubTopics>(ws)

  ws.onopen = async () => {
    console.log(`${testUserId}: WebSocket connected`)

    websocket.subscribe((data) => {
      console.log(`${testUserId}: Global message:`, data)
    })

    websocket.subscribeToEventHub('todo-created', (data) => {
      console.log(`${testUserId}: Todo created event:`, data)
    })

    websocket.subscribeToEventHub('todo-completed', (data) => {
      console.log(`${testUserId}: Todo completed event:`, data)
    })

    const route = websocket.getRoute('action')

    route.subscribe('auth', (data) => {
      console.log(`${testUserId}: Auth response:`, data)
    })

    route.subscribe('list', (data) => {
      console.log(`${testUserId}: List response:`, data)
    })

    route.subscribe('create', (data) => {
      console.log(`${testUserId}: Create response:`, data)
    })

    route.subscribe('complete', (data) => {
      console.log(`${testUserId}: Complete response:`, data)
    })

    route.send('auth', { username: 'demo', password: 'test' })

    await new Promise((resolve) => setTimeout(resolve, 500))

    route.send('subscribe', { topic: 'todo-created' })
    route.send('subscribe', { topic: 'todo-completed' })

    await new Promise((resolve) => setTimeout(resolve, 500))

    route.send('list', {
      userId: 'user1',
      completed: undefined,
      priority: undefined,
      tag: undefined,
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    route.send('create', {
      title: `Todo from ${testUserId}`,
      priority: 'high',
      userId: 'user1',
      description: undefined,
      dueDate: undefined,
      tags: undefined,
    })

    await new Promise((resolve) => setTimeout(resolve, 1000))

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
