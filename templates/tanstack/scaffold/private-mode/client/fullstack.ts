/**
 * The fullstack contract this template exists to demonstrate, checked against a
 * running `pikku serve`:
 *
 *  - the built frontend and the API answer on one origin, and a client-side
 *    route falls back to the app shell rather than 404ing;
 *  - the passphrase gate's four routes behave as the unlock screen expects —
 *    including a 403 that says nothing about how wrong the guess was, and a
 *    lockout that reports its remaining wait as `retryAfterMs`;
 *  - a locked store refuses the application's own routes with 423 while still
 *    serving the page that unlocks it.
 */
const BASE = process.env.TODO_APP_URL || 'http://localhost:4002'
const PASSPHRASE = 'correct horse battery staple'
const WRONG = 'not the passphrase'

type LockState = 'uninitialized' | 'locked' | 'unlocked'
type LockStatus = { state: LockState; retryAfterMs: number }

let failures = 0

const check = (description: string, condition: boolean, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${description}`)
  } else {
    failures += 1
    console.error(`  ✗ ${description}${detail ? ` — ${detail}` : ''}`)
  }
}

const lockRoute = async (
  path: string,
  passphrase?: string
): Promise<{ status: number; body: LockStatus | null }> => {
  const response = await fetch(`${BASE}/_pikku/data${path}`, {
    method: passphrase === undefined ? 'GET' : 'POST',
    headers:
      passphrase === undefined
        ? undefined
        : { 'content-type': 'application/json' },
    body: passphrase === undefined ? undefined : JSON.stringify({ passphrase }),
  })
  const body = response.ok ? ((await response.json()) as LockStatus) : null
  return { status: response.status, body }
}

const waitForServer = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${BASE}/_pikku/data/status`)
      if (response.ok) {
        return
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Server at ${BASE} never answered /_pikku/data/status`)
}

const openTheStore = async () => {
  const { body } = await lockRoute('/status')
  if (!body) {
    throw new Error('The status route did not answer with a lock status')
  }
  if (body.state === 'uninitialized') {
    const initialized = await lockRoute('/initialize', PASSPHRASE)
    check(
      'initialize opens a store nobody has opened before',
      initialized.body?.state === 'unlocked',
      `got ${initialized.status}`
    )
    return
  }
  if (body.state === 'locked') {
    const unlocked = await lockRoute('/unlock', PASSPHRASE)
    check(
      'unlock reopens an existing store',
      unlocked.body?.state === 'unlocked',
      `got ${unlocked.status}`
    )
  }
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

  const clientRoute = await fetch(`${BASE}/unlock`)
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
  check('GET /todos answers while unlocked', listed.status === 200)

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

const testLockedStoreRefusesData = async () => {
  console.log('A locked store refuses data but still serves its unlock screen')

  const locked = await lockRoute('/lock', PASSPHRASE)
  check(
    'lock closes the store when given the passphrase',
    locked.body?.state === 'locked',
    `got ${locked.status}`
  )

  const refused = await fetch(`${BASE}/todos?userId=user1`)
  check(
    'GET /todos answers 423 while locked',
    refused.status === 423,
    `got ${refused.status}`
  )

  const shell = await fetch(`${BASE}/unlock`)
  check(
    'the unlock screen is still served while locked',
    shell.status === 200,
    `got ${shell.status}`
  )

  const wrong = await lockRoute('/unlock', WRONG)
  check(
    'a wrong passphrase is refused with 403',
    wrong.status === 403,
    `got ${wrong.status}`
  )

  const right = await lockRoute('/unlock', PASSPHRASE)
  check(
    'the right passphrase reopens the store',
    right.body?.state === 'unlocked',
    `got ${right.status}`
  )
}

const testLockout = async () => {
  console.log('Repeated guesses open a lockout window with a wait to show')

  const statuses: number[] = []
  for (let attempt = 0; attempt < 6; attempt++) {
    const { status } = await lockRoute('/unlock', WRONG)
    statuses.push(status)
  }

  check(
    'the first five wrong guesses are plain refusals',
    statuses.slice(0, 5).every((status) => status === 403),
    `got ${statuses.join(', ')}`
  )
  check(
    'the sixth is throttled with 429',
    statuses[5] === 429,
    `got ${statuses.join(', ')}`
  )

  const { body } = await lockRoute('/status')
  check(
    'status reports how long the wait has left',
    !!body && body.retryAfterMs > 0,
    `retryAfterMs was ${body?.retryAfterMs}`
  )
}

const main = async () => {
  console.log(`Running fullstack tests against ${BASE}`)
  await waitForServer()
  await openTheStore()
  await testStaticServing()
  await testTodos()
  await testLockedStoreRefusesData()
  await testLockout()

  if (failures > 0) {
    console.error(`\n❌ ${failures} fullstack check(s) failed`)
    process.exit(1)
  }
  console.log('\n✅ Fullstack test passed')
  process.exit(0)
}

void main()
