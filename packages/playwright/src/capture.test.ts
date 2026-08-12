import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compressVideosIn, slug } from './capture.js'

describe('slug', () => {
  test('turns a description into a readable, filename-safe stem', () => {
    assert.equal(
      slug('Front desk, after check-in'),
      'front-desk-after-check-in'
    )
  })

  test('is stable for the same description', () => {
    assert.equal(slug('The Alder — arrivals'), slug('The Alder — arrivals'))
  })

  test('never yields an empty stem, so a file always has a name', () => {
    assert.equal(slug('———'), 'capture')
    assert.equal(slug(''), 'capture')
  })

  test('bounds the length, because a description may be a sentence', () => {
    assert.ok(slug('a'.repeat(200)).length <= 60)
  })
})

describe('compressVideosIn', () => {
  test('a missing directory is not an error — capture may be off', async () => {
    const warnings: string[] = []
    const count = await compressVideosIn(
      join(tmpdir(), 'pikku-capture-does-not-exist'),
      (message) => warnings.push(message)
    )

    assert.equal(count, 0)
    // No ffmpeg complaint for a run that recorded nothing.
    assert.deepEqual(warnings, [])
  })

  test('warns rather than fails when ffmpeg is unavailable', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-capture-'))
    mkdirSync(join(dir, 'video'), { recursive: true })
    writeFileSync(join(dir, 'video', 'scenario.webm'), 'not really a video')

    const warnings: string[] = []
    const count = await compressVideosIn(dir, (message) =>
      warnings.push(message)
    )

    // ffmpeg may or may not be installed wherever this runs, so assert the
    // contract rather than the outcome: the recording survives either way, and
    // the only difference is whether the run said something about it.
    assert.ok(
      existsSync(join(dir, 'video', 'scenario.webm')),
      'the raw recording is kept whether or not it could be compressed'
    )

    if (warnings.length > 0) {
      assert.match(warnings[0]!, /ffmpeg/)
      assert.equal(count, 0, 'nothing is compressed without ffmpeg')
    } else {
      t.diagnostic('ffmpeg present — compression path exercised')
    }
  })
})
