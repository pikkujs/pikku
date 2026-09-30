import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { toProgramPath } from './program-path.js'

describe('toProgramPath', () => {
  test('a Windows path takes the forward slashes TypeScript names files with', () => {
    assert.equal(
      toProgramPath('D:\\a\\pikku\\packages\\addon-console', '\\'),
      'D:/a/pikku/packages/addon-console'
    )
  })

  test('a POSIX path is unchanged', () => {
    assert.equal(toProgramPath('/home/app/src', '/'), '/home/app/src')
  })
})
