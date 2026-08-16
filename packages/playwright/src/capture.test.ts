import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compressVideo, compressVideos, hasFfmpeg, slug } from './capture.js'

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

describe('compressVideos', () => {
  test('a run that kept nothing says nothing — capture may be off', async () => {
    const warnings: string[] = []
    const renamed = await compressVideos([], (message) =>
      warnings.push(message)
    )

    assert.equal(renamed.size, 0)
    // No ffmpeg complaint for a run that recorded nothing.
    assert.deepEqual(warnings, [])
  })

  test('a recording that is gone is skipped rather than failing the close', async () => {
    const renamed = await compressVideos([
      join(tmpdir(), 'pikku-capture-does-not-exist', 'gone.webm'),
    ])

    assert.equal(renamed.size, 0)
  })

  test('warns rather than fails when ffmpeg is unavailable', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-capture-'))
    mkdirSync(join(dir, 'video'), { recursive: true })
    const file = join(dir, 'video', 'scenario.webm')
    writeFileSync(file, 'not really a video')

    const warnings: string[] = []
    const renamed = await compressVideos([file], (message) =>
      warnings.push(message)
    )

    // ffmpeg may or may not be installed wherever this runs, so assert the
    // contract rather than the outcome: the recording survives either way, and
    // the only difference is whether the run said something about it.
    assert.ok(
      existsSync(file),
      'the raw recording is kept whether or not it could be compressed'
    )
    assert.equal(
      renamed.size,
      0,
      'an unencodable recording keeps the name the record already has'
    )

    if (warnings.length > 0) {
      assert.match(warnings[0]!, /ffmpeg/)
    } else {
      t.diagnostic('ffmpeg present — compression path exercised')
    }
  })

  test('reports where each recording ended up, so the record can follow it', async (t) => {
    if (!(await hasFfmpeg())) {
      t.skip('ffmpeg is not on PATH')
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'pikku-capture-'))
    const source = recordFixture(dir)

    const renamed = await compressVideos([source])

    assert.deepEqual([...renamed.keys()], [source])
    assert.ok(renamed.get(source)?.endsWith('.mp4'))
  })
})

/** A real, tiny webm — the only way to assert what the encoder actually emits. */
const recordFixture = (dir: string): string => {
  const file = join(dir, 'fixture.webm')
  const made = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=320x240:rate=10',
      '-c:v',
      'libvpx',
      file,
    ],
    { stdio: 'ignore' }
  )
  assert.equal(made.status, 0, 'fixture recording could be produced')
  return file
}

describe('compressVideo', () => {
  test('re-encodes to mp4, because that is what plays in a browser', async (t) => {
    if (!(await hasFfmpeg())) {
      t.skip('ffmpeg is not on PATH')
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'pikku-encode-'))
    const source = recordFixture(dir)

    const result = await compressVideo(source)

    assert.ok(result.endsWith('.mp4'), `expected an mp4, got ${result}`)
    assert.ok(existsSync(result), 'the encoded file is on disk')
    assert.equal(
      existsSync(source),
      false,
      'and the raw recording it replaced is gone'
    )
    assert.ok(statSync(result).size > 0, 'and it is not an empty file')
  })

  test('keeps the raw recording when the input is not a video', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-encode-'))
    const file = join(dir, 'broken.webm')
    writeFileSync(file, 'not really a video')

    const result = await compressVideo(file)

    // A run that cannot encode still has footage, which beats having none.
    assert.equal(result, file)
    assert.ok(existsSync(file))
  })
})
