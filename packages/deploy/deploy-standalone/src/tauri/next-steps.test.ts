import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { renderNativeNextSteps } from './next-steps.js'

const base = {
  cwd: 'apps/customer',
  run: 'bun run',
  platforms: ['desktop'] as const,
  plugins: [],
  hasRust: true,
}

describe('renderNativeNextSteps', () => {
  it('runs tauri through the package script, never a bare npx tauri', () => {
    const text = renderNativeNextSteps({
      ...base,
      mode: { kind: 'bundle', frontendDist: '../dist' },
    }).join('\n')
    assert.match(text, /bun run tauri build/)
    assert.doesNotMatch(text, /npx tauri/)
  })

  it('names the cross-origin cost of a bundled UI', () => {
    const text = renderNativeNextSteps({
      ...base,
      mode: { kind: 'bundle', frontendDist: '../dist' },
    }).join('\n')
    assert.match(text, /bearer token/)
    assert.match(text, /tauri:\/\/localhost/)
  })

  it('sends a bundled server through the bun deploy first', () => {
    const text = renderNativeNextSteps({
      ...base,
      mode: { kind: 'sidecar' },
    }).join('\n')
    assert.match(text, /--runtime bun/)
  })

  it('gives mobile steps only for the platforms asked for', () => {
    const text = renderNativeNextSteps({
      ...base,
      platforms: ['desktop', 'android'],
      mode: { kind: 'url', url: 'https://shop.example.com' },
    }).join('\n')
    assert.match(text, /android init/)
    assert.doesNotMatch(text, /ios init/)
  })

  it('says a missing Rust toolchain is this machine’s problem, not the project’s', () => {
    const text = renderNativeNextSteps({
      ...base,
      hasRust: false,
      mode: { kind: 'url', url: 'https://shop.example.com' },
    }).join('\n')
    assert.match(text, /another machine can build it/)
  })

  it('passes on each plugin’s caveat', () => {
    const text = renderNativeNextSteps({
      ...base,
      plugins: ['biometric'],
      platforms: ['ios'],
      mode: { kind: 'bundle', frontendDist: '../dist' },
    }).join('\n')
    assert.match(text, /biometric: Authenticates a person/)
    assert.match(text, /Info\.ios\.plist/)
  })
})
