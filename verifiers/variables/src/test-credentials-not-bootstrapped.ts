/**
 * The other half of the credentials bootstrap gate. This project declares no
 * credentials, so the credentials file is never generated and the bootstrap
 * must not import it — an unconditional import would leave every project
 * without credentials failing to start on a module that does not exist.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const bootstrap = readFileSync(
  join(import.meta.dirname, '../.pikku/pikku-bootstrap.gen.ts'),
  'utf-8'
)

console.log('Testing a project without credentials imports none...\n')

const imported = /pikku-credentials\.gen\.js/.test(bootstrap)

console.log(`  bootstrap imports the credentials file: ${imported}`)

if (imported) {
  throw new Error(
    'This project declares no credentials, so pikku-bootstrap.gen.ts must ' +
      'not import a credentials file. It reads:\n' +
      bootstrap
  )
}

console.log('\n✓ No credentials file is bootstrapped')
