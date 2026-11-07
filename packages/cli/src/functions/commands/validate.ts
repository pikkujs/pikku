import { findPikkuRoot } from '@pikku/code-edit/verify'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  ValidateInput,
  ValidateOutput,
  guardProjectChecks,
  renderValidate,
  runProjectValidate,
} from '../validate/validate.js'

export const validate = pikkuSessionlessFunc({
  description:
    'Check this project against every Pikku check that applies to it — app structure, deploy readiness, type-checks, correctness checks, and the published file set of any addon it contains. Prints what was checked, with fix hints for anything wrong, and exits non-zero on any error.',
  input: ValidateInput,
  output: ValidateOutput,
  func: async (
    _services,
    {
      codegen,
      strict,
      skipTypecheck,
      skipFrontends,
      skipDeployChecks,
      migrationsBase,
    },
    { rpc }
  ) => {
    const report = await runProjectValidate(process.cwd(), {
      skipTypecheck,
      skipDeployChecks,
      migrationsBase,
      projectChecks: guardProjectChecks((request) =>
        (rpc.invoke as any)('cloudCli:CloudProjectChecks', request)
      ),
      verify: {
        codegen,
        strict,
        skipFrontends,
        pikkuCli: process.argv[1],
        rootDir: findPikkuRoot(process.cwd()) ?? undefined,
      },
    })
    if (!report.ok) process.exitCode = 1
    return report
  },
})

export { renderValidate }
