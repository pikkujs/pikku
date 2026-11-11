import { strict as assert } from 'node:assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { assembleBackendSdk, exposedClientFiles } from './backend-sdk.js'

describe('assembleBackendSdk', () => {
  const dirs: string[] = []
  after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

  const put = (file: string, content: string) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  const project = (summary: { exposed: string[]; remote: string[] }) => {
    const root = mkdtempSync(join(tmpdir(), 'backend-sdk-'))
    dirs.push(root)
    const outDir = join(root, '.pikku', 'backends', 'api')
    const files = exposedClientFiles(outDir)
    put(
      files.fetchFile!,
      "import type { Map } from '../../rpc/map.gen.js'\nimport { x } from '../../../../../src/x.js'\nexport {}\n"
    )
    put(
      join(outDir, 'rpc', 'map.gen.ts'),
      "import type { T } from '../types.d.js'\n"
    )
    put(join(outDir, 'types.d.ts'), 'export type T = 1\n')
    put(join(outDir, 'sdk', 'summary.json'), JSON.stringify(summary))
    put(
      join(root, 'package.json'),
      '{"name":"app","version":"1.2.3","peerDependencies":{"@pikku/core":"^1.0.0"}}'
    )
    return { root, outDir }
  }

  test('moves the exposed clients and the maps they import under contract/', () => {
    const { root, outDir } = project({ exposed: ['a'], remote: [] })
    const result = assembleBackendSdk({
      projectDir: root,
      rootDir: root,
      backend: 'api',
      backendOutDir: outDir,
      publish: false,
    })
    const fetch = readFileSync(
      join(result.dir, 'exposed', 'pikku-fetch.gen.ts'),
      'utf-8'
    )
    assert.match(fetch, /'\.\/contract\/rpc\/map\.gen\.js'/)
    assert.match(fetch, /'\.\.\/\.\.\/\.\.\/\.\.\/src\/x\.js'/)
    assert.ok(existsSync(join(result.dir, 'exposed', 'contract', 'types.d.ts')))
    assert.ok(existsSync(join(result.dir, 'manifest.json')))
    assert.ok(!existsSync(join(result.dir, 'remote')))
  })

  test('publish is refused when the backend has no remote functions', () => {
    const { root, outDir } = project({ exposed: ['a'], remote: [] })
    assert.throws(
      () =>
        assembleBackendSdk({
          projectDir: root,
          rootDir: root,
          backend: 'api',
          backendOutDir: outDir,
          publish: true,
        }),
      /no remote functions/
    )
  })

  test('publish packs the remote SDK beside package.json', () => {
    const { root, outDir } = project({ exposed: [], remote: ['pay'] })
    put(join(outDir, 'sdk', 'remote', 'manifest.json'), '{"name":"app-api"}')
    const result = assembleBackendSdk({
      projectDir: root,
      rootDir: root,
      backend: 'api',
      backendOutDir: outDir,
      publish: true,
    })
    assert.ok(result.tarball && existsSync(result.tarball))
    assert.ok(existsSync(join(result.dir, 'remote', 'manifest.json')))
  })
})
