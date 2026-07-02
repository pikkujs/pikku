import { Before, When } from '@cucumber/cucumber'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'
import { rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Reset the audit artifact before each security scenario so the empty state and
// the "run audit" flow each start from a known-clean slate. `pikku serve` reads
// audit.json fresh per RPC, so removing the file is enough.
Before('@security-console', function () {
  const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  rmSync(resolve(e2eRoot, '.pikku', 'audit.json'), { force: true })
})

When(
  'I open the security page',
  { timeout: 45_000 },
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/security`, { timeout: 30_000 })
    await this.page
      .getByRole('button', { name: 'Run audit' })
      .waitFor({ state: 'visible', timeout: 15_000 })
  }
)
