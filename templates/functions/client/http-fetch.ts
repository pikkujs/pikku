import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'

const start = Date.now()

async function check() {
  const TIMEOUT = 30000
  const RETRY_INTERVAL = 2000

  try {
    const todos = await pikkuFetch.get('/todos', {
      userId: 'user1',
      completed: undefined,
      priority: undefined,
      tag: undefined,
    })

    console.log('Todos:', todos)

    const created = await pikkuFetch.post('/todos', {
      title: 'Test todo from client',
      priority: 'high',
      userId: 'user1',
      description: undefined,
      dueDate: undefined,
      tags: undefined,
    })
    console.log('Created todo:', created)

    const completed = await pikkuFetch.post('/todos/:id/complete', {
      id: created.todo.id,
    })
    console.log('Completed todo:', completed)

    const deleted = await pikkuFetch.delete('/todos/:id', {
      id: created.todo.id,
    })
    console.log('Deleted todo:', deleted)

    // Test auth flow: login then logout
    const loginResult = await pikkuFetch.post('/auth/login', {
      username: 'demo',
      password: 'password',
    })
    console.log('Logged in:', loginResult)

    pikkuFetch.setAuthorizationJWT(loginResult.token)

    const logoutResult = await pikkuFetch.post('/auth/logout', {})
    console.log('Logged out:', logoutResult)

    console.log('✅ HTTP test passed')

    process.exit(0)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(JSON.stringify(err))
    console.log(`Still failing (${message}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ HTTP test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  }

  setTimeout(check, RETRY_INTERVAL)
}

const url = process.env.TODO_APP_URL || 'http://localhost:4002'
pikkuFetch.setServerUrl(url)
console.log('Starting HTTP fetch test with url:', url)

check()
