/**
 * The same fullstack contract, checked with the app actually running.
 *
 * `fullstack.ts` next door proves the server's half over HTTP, but it never
 * executes a line of the app: React never mounts, no route loads, and a
 * frontend that pikku serves perfectly while its own fetches go nowhere would
 * pass every check in it. This drives the page instead — a todo typed into
 * the form, and still there after a reload — so the parts that only exist in
 * a browser are covered too.
 */
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.TODO_APP_URL || 'http://localhost:4002'
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

const testTheAppMounts = async (page: Page) => {
  console.log('The served page mounts and reaches the API')

  await page.goto(BASE)
  await page
    .getByRole('heading', { name: 'Todos', level: 2 })
    .waitFor({ state: 'visible' })
  check('the app renders its todos page', true)

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

const testCompletingAndRemoving = async (page: Page) => {
  console.log('The list round-trips a completion and a delete')

  await page.getByLabel(`Complete ${TYPED_TODO}`).click()
  await page
    .getByLabel(`Complete ${TYPED_TODO}`)
    .and(page.locator(':disabled'))
    .waitFor({ state: 'visible' })
  check('a completed todo comes back checked and no longer editable', true)

  await page.getByLabel(`Delete ${TYPED_TODO}`).click()
  await page.getByText(TYPED_TODO).waitFor({ state: 'detached' })
  check('deleting one removes it from the list', true)
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
    await testTheAppMounts(page)
    await testWritingFromTheForm(page)
    await testCompletingAndRemoving(page)
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
