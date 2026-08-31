import assert from 'node:assert'
import { join, relative } from 'node:path'
import { describe, test } from 'node:test'
import { planDistCopies } from './dist.js'

describe('planDistCopies', () => {
  const root = join('/repo', 'addon')
  const dist = join(root, 'dist')

  const plan = (...files: string[]) =>
    planDistCopies(root, dist, files).map(({ from, to }) => [
      relative(root, from),
      relative(root, to),
    ])

  test('carries the generated json and leaves the compiled sources behind', () => {
    assert.deepEqual(
      plan(
        join(root, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
        join(root, '.pikku', 'function', 'index.ts'),
        join(root, '.pikku', 'pikku-bootstrap.gen.ts')
      ),
      [
        [
          join('.pikku', 'function', 'pikku-functions-meta.gen.json'),
          join(
            '',
            'dist',
            '.pikku',
            'function',
            'pikku-functions-meta.gen.json'
          ),
        ],
      ]
    )
  })

  test('carries a declaration file, wherever it sits', () => {
    assert.deepEqual(
      plan(
        join(root, '.pikku', 'agent', 'pikku-agent-map.gen.d.ts'),
        join(root, 'types', 'application-types.d.ts'),
        join(root, 'src', 'hello.function.ts')
      ),
      [
        [
          join('.pikku', 'agent', 'pikku-agent-map.gen.d.ts'),
          join('dist', '.pikku', 'agent', 'pikku-agent-map.gen.d.ts'),
        ],
        [
          join('types', 'application-types.d.ts'),
          join('dist', 'types', 'application-types.d.ts'),
        ],
      ]
    )
  })

  test('copies nothing when tsc already emitted everything', () => {
    assert.deepEqual(
      plan(join(root, '.pikku', 'index.ts'), join(root, 'src', 'a.ts')),
      []
    )
  })
})
