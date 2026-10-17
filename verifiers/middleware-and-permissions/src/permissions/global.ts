import { addGlobalPermission, pikkuPermission } from '#pikku/auth'

// Nothing imports this file. A global permission only exists if codegen
// imports the file that registers it, so this gate holding is the proof.
addGlobalPermission([
  pikkuPermission(
    async (_services, _data, { functionId }) => functionId !== 'globallyDenied'
  ),
])
