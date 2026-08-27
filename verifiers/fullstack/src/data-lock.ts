import { DataLock } from '@pikku/core/classification'
import { FileLockVault } from './lock-vault.service.js'

/**
 * The passphrase gate this verifier drives from a browser.
 *
 * Module scope rather than a service, because the tag middleware guarding the
 * note wirings is registered from module scope too — long before any service
 * container exists for it to be read out of.
 */
export const dataLock = new DataLock(
  new FileLockVault('.pikku-runtime/data-lock.json')
)
