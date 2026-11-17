import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { browserConfigFromEnv } from './config.js'
import { connectOrLaunch } from './browser-launch.js'

describe('connectOrLaunch', () => {
  test('a browser that does not start is one line naming both env vars', async () => {
    const config = browserConfigFromEnv(
      {},
      { PIKKU_CHROMIUM: '/nowhere/chrome' }
    )
    await assert.rejects(connectOrLaunch(config), (error: Error) => {
      assert.match(
        error.message,
        /^No browser started from \/nowhere\/chrome: set PLAYWRIGHT_CHROMIUM_PATH or PIKKU_CHROMIUM to a chrome binary/
      )
      assert.doesNotMatch(error.message, /\n/)
      return true
    })
  })
})
