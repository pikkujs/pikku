import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { StudioProjectsService, type FabricAccount } from '../server/src/projects.js'
import { startStudioServer } from '../server/src/server.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = resolve(here, '..', '..', '..')
const e2eApp = join(repo, 'e2e')
const pikku = join(repo, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const shots = process.env.STUDIO_SHOTS ?? join(here, '.shots')

const offline: FabricAccount = {
  account: async () => ({ signedIn: false, apiUrl: 'http://fabric.invalid', consoleUrl: 'http://fabric.invalid' }),
  projects: async () => [],
  startSignIn: async () => {
    throw new Error('offline')
  },
  pollSignIn: async () => 'expired',
  signOut: async () => {},
}

const base = await mkdtemp(join(tmpdir(), 'pikku-studio-e2e-'))
const garden = join(base, 'garden')
await mkdir(garden)
await writeFile(join(garden, 'package.json'), JSON.stringify({ name: 'garden' }))
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: garden })

const projects = new StudioProjectsService({
  account: offline,
  home: join(base, 'studio'),
  projectsDir: join(base, 'Pikku'),
  installCommand: () => null,
  confine: (worktree) => ({ root: worktree.path, writable: [worktree.gitDir, e2eApp], readable: [repo] }),
  devCommand: (port) => ({
    command: 'sh',
    args: [
      '-c',
      `cd ${JSON.stringify(e2eApp)} && API_URL=http://localhost:${port} SCENARIO_ACTOR_SECRET=e2e-actor-secret-long-enough-to-derive-from PIKKU_MOCK_LLM=1 exec node ${JSON.stringify(pikku)} dev --port ${port}`,
    ],
  }),
})
const studio = await startStudioServer({ port: 0, projects, home: join(base, 'studio') })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
await mkdir(shots, { recursive: true })
const step = (name: string) => console.log(`✔ ${name}`)

try {
  await page.goto(`${studio.url}/console/`)
  await page.getByTestId('studio-welcome').waitFor()
  assert.equal(await page.getByLabel(/password/i).count(), 0)
  await page.screenshot({ path: join(shots, '1-welcome.png') })
  step('welcome offers working locally or Fabric, no password')

  await page.getByTestId('studio-use-locally').click()
  await page.getByTestId('studio-choose-ai').waitFor()
  await page.screenshot({ path: join(shots, '1b-choose-ai.png') })
  step('working locally asks which AI to use')

  await page.getByTestId('studio-ai-key-open').click()
  await page.getByTestId('studio-ai-provider').click()
  await page.getByRole('option', { name: 'OpenAI' }).click()
  await page.getByTestId('studio-ai-api-key').fill('sk-test-not-real')
  await page.getByTestId('studio-ai-key-save').click()
  await page.getByTestId('studio-projects').waitFor()
  await page.getByTestId('studio-ai').getByText('Using your OpenAI key with gpt-4.1-mini.').waitFor()
  step('an API key is saved and shown in plain words')
  await page.getByTestId('studio-local').waitFor()
  assert.equal(await page.getByTestId('studio-cloud').count(), 0)
  step('working locally shows projects without a Fabric section')

  await page.getByTestId('studio-add-open').click()
  await page.getByTestId('studio-add-path').fill(garden)
  await page.getByTestId('studio-add-submit').click()
  const row = page.locator('[data-testid="studio-project"][data-name="garden"]')
  await row.waitFor()
  assert.equal(await row.getAttribute('data-location'), 'local')
  await page.screenshot({ path: join(shots, '2-projects.png') })
  step('adds a folder as a local project')

  await row.getByTestId('studio-project-open').click()
  await page.waitForURL(/\/console\/overview/, { timeout: 180_000 })
  await page.goto(`${studio.url}/console/requests`)
  await page.getByTestId('requests-new-open').waitFor({ timeout: 120_000 })
  await page.screenshot({ path: join(shots, '3-project-requests.png') })
  step('opens the project and reaches its console through Studio, no sign-in')

  await page.reload()
  await page.getByTestId('requests-new-open').waitFor({ timeout: 60_000 })
  step('stays in the project after a reload')

  await page.goto(`${studio.url}/console/publish`)
  await page.getByTestId('studio-publish').waitFor({ timeout: 60_000 })
  await page.getByTestId('studio-publish-fabric').getByText(/Sign in with Fabric from All projects/).waitFor()
  assert.equal(await page.getByTestId('studio-publish-fabric-go').count(), 0)
  for (const target of ['standalone', 'cloudflare', 'serverless', 'azure']) {
    await page.getByTestId(`studio-publish-${target}-copy`).waitFor()
  }
  await page.getByTestId('studio-publish-cloudflare-show').click()
  await page.getByTestId('studio-publish-cloudflare').getByText(/@pikku\/deploy-cloudflare/).first().waitFor()
  await page.screenshot({ path: join(shots, '4-publish.png'), fullPage: true })
  step('publish offers Fabric and a setup prompt for every other cloud')

  const opened = await page.evaluate(() => localStorage.getItem('pikku-server-url'))
  assert.match(opened ?? '', /\/p\/[a-z0-9]+$/)
  await page.evaluate(() => localStorage.setItem('pikku-server-url', window.location.origin))
  await page.goto(`${studio.url}/console/`)
  await page.getByTestId('studio-projects').waitFor()
  await page.locator('[data-testid="studio-project"][data-name="garden"]').getByText('Open', { exact: true }).first().waitFor()
  step('back on the projects list, the project shows as open')
} finally {
  await browser.close()
  await studio.close()
}
console.log(`screenshots in ${shots}`)
