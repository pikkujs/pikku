import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import {
  FabricValidateInput,
  FabricValidateOutput,
  renderValidate,
  runFabricValidate,
  runValidate,
} from './validate-core.js'

export { renderValidate, runFabricValidate, runValidate }

export const FabricValidate = pikkuSessionlessFunc({
  description:
    'Check the current project structure for fabric compatibility. Prints all missing or misconfigured items with fix hints so an AI agent or developer can resolve them.',
  input: FabricValidateInput,
  output: FabricValidateOutput,
  func: async (_services) => runFabricValidate(),
})
