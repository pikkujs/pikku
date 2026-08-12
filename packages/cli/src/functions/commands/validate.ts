import { pikkuSessionlessFunc } from '#pikku'
import {
  ValidateInput,
  ValidateOutput,
  renderValidate,
  runProjectValidate,
} from '../validate/validate.js'

export const validate = pikkuSessionlessFunc({
  description:
    'Check this project against every Pikku check that applies to it — app structure, and the published file set of any addon it contains. Prints what was checked, with fix hints for anything wrong.',
  input: ValidateInput,
  output: ValidateOutput,
  func: async () => runProjectValidate(),
})

export { renderValidate }
