import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  hostTargetTriple,
  sidecarFileName,
  parseRustcHost,
} from './target-triple.js'

describe('the target triple Tauri demands on a sidecar file name', () => {
  it('prefers what rustc says its host is', () => {
    const triple = hostTargetTriple({
      platform: 'linux',
      arch: 'x64',
      rustcVersionVerbose:
        'rustc 1.97.1\nbinary: rustc\nhost: aarch64-apple-darwin\n',
    })
    assert.equal(
      triple,
      'aarch64-apple-darwin',
      'rustc is the toolchain that will actually link the shell'
    )
  })

  it('falls back to the running platform when rustc is not installed', () => {
    assert.equal(
      hostTargetTriple({ platform: 'darwin', arch: 'arm64' }),
      'aarch64-apple-darwin'
    )
    assert.equal(
      hostTargetTriple({ platform: 'darwin', arch: 'x64' }),
      'x86_64-apple-darwin'
    )
    assert.equal(
      hostTargetTriple({ platform: 'linux', arch: 'x64' }),
      'x86_64-unknown-linux-gnu'
    )
    assert.equal(
      hostTargetTriple({ platform: 'linux', arch: 'arm64' }),
      'aarch64-unknown-linux-gnu'
    )
    assert.equal(
      hostTargetTriple({ platform: 'win32', arch: 'x64' }),
      'x86_64-pc-windows-msvc'
    )
    assert.equal(
      hostTargetTriple({ platform: 'win32', arch: 'arm64' }),
      'aarch64-pc-windows-msvc'
    )
  })

  it('names the platform it cannot map rather than guessing', () => {
    assert.throws(
      () => hostTargetTriple({ platform: 'sunos', arch: 'mips' as never }),
      /sunos/
    )
  })

  it('ignores rustc output that carries no host line', () => {
    assert.equal(parseRustcHost('rustc 1.97.1 (8bab26f4f)'), undefined)
    assert.equal(
      hostTargetTriple({
        platform: 'darwin',
        arch: 'arm64',
        rustcVersionVerbose: 'rustc 1.97.1',
      }),
      'aarch64-apple-darwin'
    )
  })

  it('suffixes the binary the way externalBin resolves it', () => {
    assert.equal(
      sidecarFileName('shop', 'aarch64-apple-darwin'),
      'shop-aarch64-apple-darwin'
    )
  })

  it('keeps the .exe extension after the triple on windows', () => {
    assert.equal(
      sidecarFileName('shop', 'x86_64-pc-windows-msvc'),
      'shop-x86_64-pc-windows-msvc.exe'
    )
  })
})
