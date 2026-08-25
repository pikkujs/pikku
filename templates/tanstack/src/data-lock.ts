import { DataLock } from '@pikku/core/classification'
import { FileLockVault } from './services/lock-vault.service.js'

/**
 * The passphrase gate for this server's data.
 *
 * A module-level instance rather than a service, because the tag middleware
 * that guards the todo wirings is registered from module scope, where codegen
 * can see it, long before any service container exists.
 */
export const dataLock = new DataLock(
  new FileLockVault('.pikku-runtime/data-lock.json')
)
