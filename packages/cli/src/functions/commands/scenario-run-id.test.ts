import assert from 'node:assert/strict'
import { test } from 'node:test'

import { scenarioRun } from './scenario.js'

const run = (runId: string) =>
  scenarioRun.func(
    {} as never,
    { environment: 'local', runId } as never,
    {} as never
  )

for (const runId of ['../escape', 'a/b', '-leading', '', 'spaced id']) {
  test(`--run-id '${runId}' is refused before anything runs`, async () => {
    await assert.rejects(run(runId), /not a usable run id/)
  })
}
