import { pikkuSessionlessFunc } from '#pikku'
import {
  WorkspaceValidateInput,
  WorkspaceValidateOutput,
  renderWorkspaceValidate,
  runWorkspaceValidate,
} from '../validate/workspace-validate.js'

export const workspaceValidate = pikkuSessionlessFunc({
  description:
    'Check the current Pikku workspace structure for compatibility. Prints all missing or misconfigured items with fix hints.',
  input: WorkspaceValidateInput,
  output: WorkspaceValidateOutput,
  func: async () => runWorkspaceValidate(),
})

export { renderWorkspaceValidate }
