import assert from 'node:assert'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { planDistCopies } from './dist.js'

describe('planDistCopies', () => {
  const root = join('/repo', 'addon')
  const dist = join(root, 'dist')

  test('carries the generated json and leaves the compiled sources behind', () => {
    const copies = planDistCopies(root, dist, {
      pikku: [
        join(root, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
        join(root, '.pikku', 'function', 'index.ts'),
        join(root, '.pikku', 'pikku-bootstrap.gen.ts'),
      ],
      src: [],
    })

    assert.deepEqual(copies, [
      {
        from: join(root, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
        to: join(dist, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
      },
    ])
  })

  test('carries a hand-authored declaration but not a source tsc compiles', () => {
    const copies = planDistCopies(root, dist, {
      pikku: [],
      src: [
        join(root, 'types', 'application-types.d.ts'),
        join(root, 'src', 'hello.function.ts'),
      ],
    })

    assert.deepEqual(copies, [
      {
        from: join(root, 'types', 'application-types.d.ts'),
        to: join(dist, 'types', 'application-types.d.ts'),
      },
    ])
  })

  test('mirrors the tree under the out dir', () => {
    const copies = planDistCopies(root, dist, {
      pikku: [join(root, '.pikku', 'scopes', 'pikku-roles-meta.gen.json')],
      src: [],
    })

    assert.equal(
      copies[0]!.to,
      join(dist, '.pikku', 'scopes', 'pikku-roles-meta.gen.json')
    )
  })

  test('copies nothing when tsc already emitted everything', () => {
    assert.deepEqual(
      planDistCopies(root, dist, {
        pikku: [join(root, '.pikku', 'index.ts')],
        src: [join(root, 'src', 'a.ts')],
      }),
      []
    )
  })
})
