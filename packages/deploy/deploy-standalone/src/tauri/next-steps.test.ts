import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { resolveNativeApis } from './native.js'
import { renderTauriNextSteps } from './next-steps.js'

describe('what to tell someone holding a freshly generated shell', () => {
  it('names the command that turns the crate into an app', () => {
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
    }).join('\n')

    assert.match(lines, /cd \/work\/shop\/src-tauri/)
    assert.match(lines, /tauri build/)
  })

  it('says a toolchain is missing rather than letting cargo say it', () => {
    // Generation is pure Node, so `--desktop` succeeds on a machine that cannot
    // build the result. Someone who has never used Tauri would otherwise find
    // out from a cargo error, at the point they least expect one.
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: false,
    }).join('\n')

    assert.match(lines, /Rust/)
    assert.match(lines, /tauri\.app/)
  })

  it('stays quiet about prerequisites that are already met', () => {
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
    }).join('\n')

    assert.doesNotMatch(lines, /tauri\.app/)
  })

  it('offers phone builds only for a shell pointed at a remote server', () => {
    const remote = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
      remoteUrl: 'https://shop.example.com',
    }).join('\n')
    assert.match(remote, /tauri android init/)
    assert.match(remote, /tauri ios init/)

    const sidecar = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
    }).join('\n')
    assert.doesNotMatch(sidecar, /tauri (android|ios)/)
    assert.match(sidecar, /desktop-only/)
    assert.match(sidecar, /--desktop-url/)
  })

  it('names the granted origin, the consent strings and each caveat', () => {
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
      remoteUrl: 'https://shop.example.com/app',
      native: resolveNativeApis('biometric,haptics'),
    }).join('\n')
    assert.match(
      lines,
      /biometric, haptics — granted to https:\/\/shop\.example\.com$/m
    )
    assert.match(lines, /Info\.ios\.plist/)
    assert.match(lines, /biometric: Authenticates a person/)
  })

  it('says nothing of a plist when no chosen API needs consent', () => {
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
      remoteUrl: 'https://shop.example.com',
      native: resolveNativeApis('haptics'),
    }).join('\n')
    assert.doesNotMatch(lines, /Info\.ios\.plist/)
  })
})
