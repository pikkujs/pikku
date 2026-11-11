import { describe, test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canResolvePackage } from './pikku-command-react-query.js'

describe('canResolvePackage', () => {
  test('finds a package in an ancestor node_modules, not one that is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'resolve-pkg-'))
    const pkg = join(root, 'node_modules', '@tanstack', 'react-query')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'package.json'), '{}')
    const project = join(root, 'apps', 'app')
    mkdirSync(project, { recursive: true })
    expect(canResolvePackage(project, '@tanstack/react-query')).toBe(true)
    expect(canResolvePackage(project, '@pikku/react-not-here')).toBe(false)
  })
})
