/**
 * The generated credentials file is what registers the project's own credential
 * meta into pikku state, and only a side-effect import in the bootstrap runs
 * it. Without that import the file is generated, type-checks, and never
 * executes — so `wire.getCredential` resolves an addon's singleton and silently
 * fails to resolve the app's own.
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

console.log('Testing the credentials file reaches the bootstrap...\n')

const imported = /^import '\.\/credentials\/pikku-credentials\.gen\.js'$/m.test(
  bootstrap
)

console.log(`  bootstrap imports the credentials file: ${imported}`)

if (!imported) {
  throw new Error(
    'This project declares credentials, so pikku-bootstrap.gen.ts must ' +
      'side-effect import the generated credentials file. It reads:\n' +
      bootstrap
  )
}

console.log('\n✓ The credentials file is bootstrapped')
