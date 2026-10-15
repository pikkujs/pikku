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
    'Check this project against every Pikku check that applies to it — app structure, deploy readiness, and the published file set of any addon it contains. Prints what was checked, with fix hints for anything wrong.',
  input: ValidateInput,
  output: ValidateOutput,
  func: async (
    _services,
    { skipTypecheck, skipDeployChecks, migrationsBase },
    { rpc }
  ) =>
    runProjectValidate(process.cwd(), {
      skipTypecheck,
      skipDeployChecks,
      migrationsBase,
      projectChecks: guardProjectChecks((request) =>
        (rpc.invoke as any)('cloud:CloudProjectChecks', request)
      ),
    }),
})

export { renderValidate }
