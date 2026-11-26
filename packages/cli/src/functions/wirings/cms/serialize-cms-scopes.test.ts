import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCmsModel } from './build-cms-model.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/cms/model-fixtures.js'
import { serializeCmsScopes } from './serialize-cms-scopes.js'

const model = () => {
  const declaration: any = testDeclaration()
  declaration.therapist.delete = true
  declaration.therapist.edit = { name: true }
  return buildCmsModel({ declaration, tables: testTables(), buckets: ['site'] })
}

/** One leaf per enabled operation and no other, the write leaves live. */
const GOLDEN = {
  cms: {
    displayName: 'CMS',
    description: 'Every CMS collection. Meant for super admins only.',
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
const evaluate = (content: string): unknown =>
  new Function(
    'defineScope',
    `let tree\n${content.slice(content.indexOf('\n') + 1).replace('defineScope(', 'tree = (')}\nreturn tree`
  )()

describe('serializeCmsScopes', () => {
  test('writes the golden tree as one literal defineScope', () => {
    const content = serializeCmsScopes(model(), './scopes.js')
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
    const tree: any = evaluate(serializeCmsScopes(built, './scopes.js'))
    assert.equal(
      tree.cms.scopes.offering.description,
      built.collections[0]!.label
    )
  })
})
