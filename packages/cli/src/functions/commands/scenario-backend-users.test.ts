import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { groupVirtualUsersByBackend } from './scenario-backend-users.js'

const user = (id: string, backend?: string) =>
  ({
    id,
    name: id,
    email: `${id}@x.invalid`,
    ...(backend ? { backend } : {}),
  }) as any

describe('groupVirtualUsersByBackend', () => {
  test('users without a backend go to the default one', () => {
    const groups = groupVirtualUsersByBackend(
      { a: user('a'), b: user('b', 'admin'), c: user('c', 'web') },
      'web'
    )
    assert.deepEqual([...groups.keys()], ['web', 'admin'])
    assert.deepEqual(Object.keys(groups.get('web')!), ['a', 'c'])
    assert.deepEqual(Object.keys(groups.get('admin')!), ['b'])
  })
})
