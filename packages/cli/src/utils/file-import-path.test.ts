import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { getFileImportRelativePath } from './file-import-path.js'

describe('getFileImportRelativePath', () => {
  test('should return relative path for files in same directory', () => {
    const from = '/project/src/file1.ts'
    const to = '/project/src/file2.ts'
    const packageMappings = {}

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, './file2.js')
  })

  test('should return relative path for files in different directories', () => {
    const from = '/project/src/file1.ts'
    const to = '/project/lib/file2.ts'
    const packageMappings = {}

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '../lib/file2.js')
  })

  test('should use package mapping when files are in different packages', () => {
    const from = '/project/packages/app/src/file1.ts'
    const to = '/project/packages/sdk/src/file2.ts'
    const packageMappings = {
      'packages/sdk': '@myorg/sdk',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '@myorg/sdk/src/file2.js')
  })

  test('should NOT use package mapping when files are in same package', () => {
    const from = '/project/packages/sdk/src/file1.ts'
    const to = '/project/packages/sdk/lib/file2.ts'
    const packageMappings = {
      'packages/sdk': '@myorg/sdk',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '../lib/file2.js')
  })

  test('should use package mapping when only target file is in mapped package', () => {
    const from = '/project/apps/web/src/file1.ts'
    const to = '/project/packages/sdk/src/file2.ts'
    const packageMappings = {
      'packages/sdk': '@myorg/sdk',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '@myorg/sdk/src/file2.js')
  })

  test('should handle multiple package mappings correctly', () => {
    const from = '/project/packages/app/src/file1.ts'
    const to = '/project/packages/utils/src/file2.ts'
    const packageMappings = {
      'packages/app': '@myorg/app',
      'packages/utils': '@myorg/utils',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '@myorg/utils/src/file2.js')
  })

  test('should preserve relative path when both files are in same package directory', () => {
    const from = '/project/packages/sdk/src/components/file1.ts'
    const to = '/project/packages/sdk/src/utils/file2.ts'
    const packageMappings = {
      'packages/sdk': '@myorg/sdk',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '../utils/file2.js')
  })

  test('should work with nested package structures', () => {
    const from = '/project/packages/app/src/file1.ts'
    const to = '/project/packages/app/lib/nested/file2.ts'
    const packageMappings = {
      'packages/app': '@myorg/app',
      'packages/sdk': '@myorg/sdk',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '../lib/nested/file2.js')
  })

  test('should handle complex path structures', () => {
    const from =
      '/Users/user/project/workspace-starter/packages/sdk/.pikku/pikku-fetch.gen.ts'
    const to =
      '/Users/user/project/workspace-starter/packages/functions/.pikku/http/pikku-http-routes-map.gen.d.ts'
    const packageMappings = {
      'packages/sdk': '@workspace/sdk',
      'packages/functions': '@workspace/functions',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(
      result,
      '@workspace/functions/.pikku/http/pikku-http-routes-map.gen.d.js'
    )
  })

  test('should handle empty package mappings', () => {
    const from = '/project/src/file1.ts'
    const to = '/project/lib/file2.ts'
    const packageMappings = {}

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '../lib/file2.js')
  })

  test('should replace .ts extension with .js', () => {
    const from = '/project/src/file1.ts'
    const to = '/project/src/file2.tsx'
    const packageMappings = {}

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, './file2.tsx'.replace('.ts', '.js'))
  })

  test('should strip everything before and including node_modules/', () => {
    const from =
      '/project/packages/functions/.pikku/http/pikku-http-routes-map.gen.d.ts'
    const to =
      '/project/packages/functions/../../../../node_modules/@pikku/core/dist/types/core.types.d.ts'
    const packageMappings = {}

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '@pikku/core/dist/types/core.types.d.js')
  })

  test('should handle node_modules path with package mappings', () => {
    const from = '/project/packages/app/src/file1.ts'
    const to = '/project/packages/app/node_modules/@myorg/utils/dist/utils.d.ts'
    const packageMappings = {
      'packages/app': '@myorg/app',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '@myorg/utils/dist/utils.d.js')
  })

  test('should handle deeply nested node_modules paths', () => {
    const from =
      '/Users/user/project/workspace-starter/packages/functions/.pikku/http/pikku-http-routes-map.gen.d.ts'
    const to =
      '/Users/user/project/workspace-starter/packages/functions/../../../../node_modules/@pikku/core/dist/types/core.types.d.ts'
    const packageMappings = {
      'packages/functions': '@workspace/functions',
    }

    const result = getFileImportRelativePath(from, to, packageMappings)

    assert.strictEqual(result, '@pikku/core/dist/types/core.types.d.js')
  })
})
