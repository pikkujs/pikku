import { pikkuSessionlessFunc } from '#pikku/function'
import {
  EnableOxlintInput,
  EnableOxlintOutput,
  renderEnableOxlint,
  runEnableOxlint,
} from '../validate/oxlint-enable.js'

export const enableOxlint = pikkuSessionlessFunc({
  description:
    'Set oxlint up for this app: devDependencies, a config with the type-aware promise rules at error, and a lint script. Touches configuration and dependencies only, never source.',
  input: EnableOxlintInput,
  output: EnableOxlintOutput,
  func: async ({ config }, { dryRun }) =>
    runEnableOxlint(config.configDir, { dryRun }),
})

export { renderEnableOxlint }
