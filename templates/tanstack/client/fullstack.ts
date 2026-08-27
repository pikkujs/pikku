/**
 * The fullstack contract this template exists to demonstrate, checked against a
 * running `pikku serve`:
 *
 *  - the built frontend and the API answer on one origin, and a client-side
 *    route falls back to the app shell rather than 404ing;
 *  - the generated HTTP surface serves the todo wirings the app calls.
 */
const BASE = process.env.TODO_APP_URL || 'http://localhost:4002'

let failures = 0

const check = (description: string, condition: boolean, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${description}`)
  } else {
    failures += 1
    console.error(`  ✗ ${description}${detail ? ` — ${detail}` : ''}`)
  }
}

const waitForServer = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${BASE}/todos?userId=user1`)
      if (response.ok) {
        return
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Server at ${BASE} never answered /todos`)
}

const testStaticServing = async () => {
  console.log('Frontend served from the API origin')

  const root = await fetch(`${BASE}/`)
  const rootBody = await root.text()
  check('GET / serves the built app shell', root.status === 200)
  check(
    'the shell is the frontend build, not an API response',
    rootBody.includes('<!DOCTYPE html>') || rootBody.includes('<!doctype html>')
  )

  const clientRoute = await fetch(`${BASE}/some/client/route`)
  const clientRouteBody = await clientRoute.text()
  check(
    'a client-side route falls back to the shell',
    clientRoute.status === 200 && clientRouteBody === rootBody,
    `got ${clientRoute.status}`
  )

  // Route dispatch runs before the SPA fallback, so a path the API claims is
  // answered by the API even when the handler has nothing to return — it is
  // only genuinely unclaimed paths that reach the shell.
  const claimedApi = await fetch(`${BASE}/todos/no-such-todo`)
  const claimedApiBody = await claimedApi.text()
  check(
    'the SPA fallback does not swallow a path the API claims',
    claimedApi.status === 200 && claimedApiBody.startsWith('{'),
    `got ${claimedApi.status} ${claimedApiBody.slice(0, 40)}`
  )
}

const testTodos = async () => {
  console.log('Todos through the generated HTTP surface')

  const listed = await fetch(`${BASE}/todos?userId=user1`)
  check('GET /todos answers', listed.status === 200)

  const created = await fetch(`${BASE}/todos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Ship the fullstack template',
      userId: 'user1',
    }),
  })
  const createdBody = (await created.json()) as { todo: { id: string } }
  check(
    'POST /todos creates one',
    created.status === 200 && !!createdBody.todo?.id
  )

  const completed = await fetch(
    `${BASE}/todos/${createdBody.todo.id}/complete`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }
  )
  check('POST /todos/:id/complete completes it', completed.status === 200)

  const deleted = await fetch(`${BASE}/todos/${createdBody.todo.id}`, {
    method: 'DELETE',
  })
  check('DELETE /todos/:id removes it', deleted.status === 200)
}

const main = async () => {
  console.log(`Running fullstack tests against ${BASE}`)
  await waitForServer()
  await testStaticServing()
  await testTodos()

  if (failures > 0) {
    console.error(`\n❌ ${failures} fullstack check(s) failed`)
    process.exit(1)
  }
  console.log('\n✅ Fullstack test passed')
  process.exit(0)
}

void main()
