import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { collectLocalFileClosure } from './addon-file-closure.js'

// In-memory project mirroring deepl's owned-service file graph:
//   deepl-api.service.ts  --imports type-->  deepl.secret.ts  --imports-->  (zod, @pikku/core/secret)
//   deepl-api.service.ts  --imports-->  deepl.types.ts
const FILES: Record<string, string> = {
  '/p/src/deepl-api.service.ts': `import type { DeeplSecrets } from './deepl.secret.js'
import type { Lang } from './deepl.types.js'
export class DeeplService { constructor(creds: DeeplSecrets) {} }
`,
  '/p/src/deepl.secret.ts': `import { z } from 'zod'
import { wireSecret } from '@pikku/core/secret'
export type DeeplSecrets = { apiKey: string }
wireSecret({ name: 'deepl', secretId: 'DEEPL_CREDENTIALS', schema: z.object({}) })
`,
  '/p/src/deepl.types.ts': `export type Lang = 'EN' | 'DE'
`,
}

const read = (abs: string): string | null => FILES[abs] ?? null

describe('collectLocalFileClosure', () => {
  test('chases sibling-imported local files transitively', () => {
    const closure = collectLocalFileClosure(['/p/src/deepl-api.service.ts'], read)
    assert.deepEqual(
      [...closure.keys()].sort(),
      [
        '/p/src/deepl-api.service.ts',
        '/p/src/deepl.secret.ts',
        '/p/src/deepl.types.ts',
      ]
    )
  })

  test('keeps the wireSecret-bearing file (required-secret discovery)', () => {
    const closure = collectLocalFileClosure(['/p/src/deepl-api.service.ts'], read)
    assert.match(closure.get('/p/src/deepl.secret.ts')!, /wireSecret\(/)
  })

  test('does not follow external-package imports', () => {
    const closure = collectLocalFileClosure(['/p/src/deepl.secret.ts'], read)
    // only the secret file itself — zod / @pikku/core/secret are not local
    assert.deepEqual([...closure.keys()], ['/p/src/deepl.secret.ts'])
  })

  test('ignores unresolvable entries without throwing', () => {
    const closure = collectLocalFileClosure(['/p/src/missing.ts'], read)
    assert.equal(closure.size, 0)
  })
})
