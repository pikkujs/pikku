/**
 * The same fullstack contract, checked with the app actually running.
 *
 * `fullstack.ts` next door proves the server's half over HTTP, but it never
 * executes a line of the app: React never mounts, no route guard runs, and a
 * frontend that pikku serves perfectly while its own fetches go nowhere would
 * pass every check in it. This walks the screens instead — first run, unlock,
 * a todo typed into the form — so the parts that only exist in a browser are
 * covered too.
 *
 * It runs before `fullstack.ts` because that one finishes by tripping the
 * lockout deliberately, and a throttled store cannot be opened from a form.
 */
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.TODO_APP_URL || 'http://localhost:4002'
const PASSPHRASE = 'correct horse battery staple'
const WRONG = 'not the passphrase'
const TYPED_TODO = 'Typed into the running app'

let failures = 0

const check = (description: string, condition: boolean, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${description}`)
  } else {
    failures += 1
    console.error(`  ✗ ${description}${detail ? ` — ${detail}` : ''}`)
  }
}

const headerLabel = (page: Page) => page.locator('.header span').textContent()

const submitPassphrase = async (page: Page, passphrase: string) => {
  await page.locator('#passphrase').fill(passphrase)
  await page.getByRole('button', { name: /Initialize|Unlock/ }).click()
}

const lockTheStore = async (page: Page) => {
  const response = await page.request.post(`${BASE}/_pikku/data/lock`, {
    data: { passphrase: PASSPHRASE },
  })
  check(
    'the store can be shut from outside the browser',
    response.status() === 200,
    `got ${response.status()}`
  )
}

const testFirstRun = async (page: Page) => {
  console.log('A store nobody has opened sends the browser to its first run')

  await page.goto(BASE)
  await page.waitForURL('**/initialize')
  check('/ redirects to /initialize while uninitialized', true)
  await page
    .getByRole('heading', { name: 'Choose a passphrase' })
    .waitFor({ state: 'visible' })
  check(
    'the header says the store has never been opened',
    (await headerLabel(page)) === 'store not yet initialized'
  )
}

const testOpeningFromTheForm = async (page: Page) => {
  console.log('The passphrase typed into the page opens the store')

  await submitPassphrase(page, PASSPHRASE)
  await page.waitForURL(`${BASE}/`)
  await page
    .getByRole('heading', { name: 'Todos', level: 2 })
    .waitFor({ state: 'visible' })
  check(
    'the header flips to unlocked',
    (await headerLabel(page)) === 'store unlocked'
  )

  // Seeded server-side, so its presence is the app's own fetch having reached
  // the API on this origin rather than anything the page could invent.
  await page.getByText('Learn Pikku').waitFor({ state: 'visible' })
  check('todos the API owns are rendered', true)
}

const testWritingFromTheForm = async (page: Page) => {
  console.log('A todo typed into the form survives a reload')

  await page.getByLabel('New todo').fill(TYPED_TODO)
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText(TYPED_TODO).waitFor({ state: 'visible' })

  await page.reload()
  await page.getByText(TYPED_TODO).waitFor({ state: 'visible' })
  check('it is still there after a reload, so the server kept it', true)
}

const testLockedStoreSendsTheBrowserToUnlock = async (page: Page) => {
  console.log('Shutting the store sends an open page to the unlock screen')

  await lockTheStore(page)
  await page.goto(BASE)
  await page.waitForURL('**/unlock')
  await page
    .getByRole('heading', { name: 'Unlock this store' })
    .waitFor({ state: 'visible' })
  check(
    'the header says the store is locked',
    (await headerLabel(page)) === 'store locked'
  )
}

const testWrongPassphraseSaysNothingUseful = async (page: Page) => {
  console.log('A wrong guess is refused without hinting')

  await submitPassphrase(page, WRONG)
  const notice = page.locator('.notice')
  await notice.filter({ hasText: /\S/ }).waitFor({ state: 'visible' })
  const message = (await notice.textContent()) ?? ''
  check(
    'the form shows a refusal',
    message.trim().length > 0,
    'the notice stayed empty'
  )
  check(
    'the refusal does not say the passphrase was close, or which part was wrong',
    !/close|almost|character|length|correct so far/i.test(message),
    message
  )
  check(
    'a refused guess leaves the browser on the unlock screen',
    new URL(page.url()).pathname === '/unlock',
    page.url()
  )
}

const testReopening = async (page: Page) => {
  console.log('The right passphrase reopens the store, todos and all')

  await submitPassphrase(page, PASSPHRASE)
  await page.waitForURL(`${BASE}/`)
  check(
    'the header flips back to unlocked',
    (await headerLabel(page)) === 'store unlocked'
  )
  await page.getByText(TYPED_TODO).waitFor({ state: 'visible' })
  check('the todo typed earlier is still listed', true)
}

const main = async () => {
  console.log(`Running browser tests against ${BASE}`)
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // A page that throws on mount still serves a 200 shell, so an uncaught error
  // has to fail the run rather than show up as a missing element later.
  page.on('pageerror', (error) => {
    failures += 1
    console.error(`  ✗ the page threw — ${error.message}`)
  })

  try {
    await testFirstRun(page)
    await testOpeningFromTheForm(page)
    await testWritingFromTheForm(page)
    await testLockedStoreSendsTheBrowserToUnlock(page)
    await testWrongPassphraseSaysNothingUseful(page)
    await testReopening(page)
  } finally {
    await browser.close()
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} browser check(s) failed`)
    process.exit(1)
  }
  console.log('\n✅ Browser test passed')
  process.exit(0)
}

void main()
