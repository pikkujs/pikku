import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { buildCollectionsModel } from './build-collection-model.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/collections/model-fixtures.js'
import { serializeCollectionScopes } from './serialize-collection-scopes.js'

const model = () => {
  const declaration: any = testDeclaration()
  declaration.therapist.delete = true
  declaration.therapist.edit = { name: true }
  return buildCollectionsModel({
    declaration,
    tables: testTables(),
    buckets: ['site'],
  })
}

/** One leaf per enabled operation and no other, the write leaves live. */
const GOLDEN = {
  collections: {
    displayName: 'collection',
    description: 'Every collection. Meant for super admins only.',
    scopes: {
      offering: {
        description: 'Offerings',
        scopes: {
          read: { description: 'See Offerings' },
          create: { description: 'Create Offerings', live: true },
          edit: { description: 'Edit Offerings', live: true },
        },
      },
      therapist: {
        description: 'Therapists',
        scopes: {
          read: { description: 'See Therapists' },
          edit: { description: 'Edit Therapists', live: true },
          delete: { description: 'Delete Therapists', live: true },
        },
      },
    },
  },
}

/** The argument of the one `defineScope` call. */
const evaluate = (content: string): unknown => {
  let tree: unknown
  runInNewContext(content.slice(content.indexOf('\n') + 1), {
    defineScope: (declared: unknown) => {
      tree = declared
    },
  })
  // Its objects come from another realm, which strict equality tells apart.
  return structuredClone(tree)
}

describe('serializeCollectionScopes', () => {
  test('writes the golden tree as one literal defineScope', () => {
    const content = serializeCollectionScopes(model(), './scopes.js')
    assert.match(content, /^import \{ defineScope \} from '\.\/scopes\.js'\n/)
    assert.deepEqual(evaluate(content), GOLDEN)
    assert.doesNotMatch(
      content,
      /^\s*"[^"]*":/m,
      'the inspector skips quoted keys'
    )
  })

  test('a label cannot leave its string', () => {
    const built = model()
    built.collections[0]!.label = `'"}) ; throw new Error("x") //\n\u2028`
    const tree: any = evaluate(serializeCollectionScopes(built, './scopes.js'))
    assert.equal(
      tree.collections.scopes.offering.description,
      built.collections[0]!.label
    )
  })
})
