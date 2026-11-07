/**
 * The other half of the credentials bootstrap gate. This project declares no
 * credentials, so the credentials file is never generated and the bootstrap
 * must not import it — an unconditional import would leave every project
 * without credentials failing to start on a module that does not exist.
 */

import { join } from 'node:path'
import { createScriptContent, ingestText } from './script-content.js'

const content = createScriptContent(
  join(import.meta.dirname, '../.pikku-runtime/script-content')
)

const bootstrap = await ingestText(
  content,
  join(import.meta.dirname, '../.pikku/pikku-bootstrap.gen.ts')
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
