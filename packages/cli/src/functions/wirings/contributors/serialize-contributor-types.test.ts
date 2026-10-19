import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeContributorTypes } from './serialize-contributor-types.js'

const IMPORT =
  "import type { SingletonServices } from '../../types/application-types.js'"

/**
 * `#pikku/contributor` is erased at runtime except for core's helper. These
 * pin the two properties a Worker or standalone bundle relies on: the services
 * type arrives through `import type`, and the one runtime import is core.
 */
describe('serializeContributorTypes', () => {
  const content = serializeContributorTypes(IMPORT)

  test('types Contributor against the project singleton services', () => {
    assert.match(
      content,
      /export type Contributor<[\s\S]*?> = CoreContributor<SingletonServices, TPlatform>/
    )
    assert.ok(content.includes(IMPORT))
  })

  test('re-binds core defineContributors, it does not reimplement it', () => {
    assert.match(
      content,
      /import \{ defineContributors as coreDefineContributors \} from '@pikku\/core\/contributors'/
    )
    assert.match(content, /\) => T = coreDefineContributors/)
  })

  test('has no runtime import but core and no #pikku specifier', () => {
    const imports = [...content.matchAll(/^import (?!type)[^\n]*$/gm)].map(
      (m) => m[0]
    )
    assert.deepEqual(imports, [
      "import { defineContributors as coreDefineContributors } from '@pikku/core/contributors'",
    ])
    assert.ok(!/^(import|export)[^\n]*#pikku\//m.test(content))
    assert.ok(!/^import '/m.test(content), 'no side-effect import')
  })
})
