import { pikkuHarness } from '@pikku/core/harness'
import type { HarnessGateName } from '#pikku/addon/harness/pikku-harness-gate-names.gen.js'
import { checkGate } from './gates/check.js'
import { handTypedTablesGate } from './gates/hand-typed-tables.js'
import { migrationGate } from './gates/migration.js'
import { oxfmtGate } from './gates/oxfmt.js'
import { oxlintGate } from './gates/oxlint.js'
import { pagesGate } from './gates/pages.js'
import { planGate } from './gates/plan.js'
import { trailerGate } from './mark-done.js'

/**
 * The harness a changeset is built with. `pikku check` and the page compare write under `.pikku`, so
 * they run first, one at a time; then the oxfmt fixer, whose changes the engine commits; then
 * oxlint, the trailers, the migration declaration, the plan and no hand-typed tables side by side.
 * Its gates are listed by reference, so a project runs it as the addon declares it.
 */
export const buildHarness = pikkuHarness<HarnessGateName>({
  name: 'build',
  description:
    'Builds one changeset of the changes queue and judges it as pikku changes done does',
  agent: { model: 'default' },
  gates: [
    checkGate,
    oxfmtGate,
    oxlintGate,
    trailerGate,
    migrationGate,
    planGate,
    pagesGate,
    handTypedTablesGate,
  ],
})
