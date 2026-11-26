import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { buildCrudModel } from './build-crud-model.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/crud/model-fixtures.js'
import { serializeCrudScopes } from './serialize-crud-scopes.js'

const model = () => {
  const declaration: any = testDeclaration()
  declaration.therapist.delete = true
  declaration.therapist.edit = { name: true }
  return buildCrudModel({
    declaration,
    tables: testTables(),
    buckets: ['site'],
  })
}

/** One leaf per enabled operation and no other, the write leaves live. */
const GOLDEN = {
  crud: {
    displayName: 'CRUD',
    description: 'Every CRUD collection. Meant for super admins only.',
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

describe('serializeCrudScopes', () => {
  test('writes the golden tree as one literal defineScope', () => {
    const content = serializeCrudScopes(model(), './scopes.js')
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
    const tree: any = evaluate(serializeCrudScopes(built, './scopes.js'))
    assert.equal(
      tree.crud.scopes.offering.description,
      built.collections[0]!.label
    )
  })
})
