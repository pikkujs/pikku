// test.js
import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  lazymkdir,
  mergeDirectories,
  mergeJsonFiles,
  replaceFunctionReferences,
  cleanTSConfig,
  wranglerChanges,
  serverlessChanges,
  updatePackageJSONScripts,
  deepMerge,
} from './utils.js'

describe('Functions Test Suite', () => {
  let tempRoot: string

  // Create a global temporary directory before the tests run.
  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'functions-tests-'))
  })

  // Remove the temporary directory after all tests finish.
  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('deepMerge: merges two simple objects', () => {
    const target = { a: 1, b: { x: 10 } }
    const source = { b: { y: 20 }, c: 3 }
    const result = deepMerge(target, source)
    assert.deepStrictEqual(result, { a: 1, b: { x: 10, y: 20 }, c: 3 })
  })

  test('deepMerge: returns source if target is not an object', () => {
    const result = deepMerge(null, { a: 1 })
    assert.deepStrictEqual(result, { a: 1 })
  })

  test('deepMerge: returns target if source is not an object', () => {
    const result = deepMerge({ a: 1 }, null)
    assert.deepStrictEqual(result, { a: 1 })
  })

  test('lazymkdir: creates a directory if it does not exist', async () => {
    const newDir = path.join(tempRoot, 'lazymkdir-subdir')
    await lazymkdir(newDir)
    assert.ok(fs.existsSync(newDir), 'Directory should have been created')
  })

  test('mergeDirectories: moves files and directories from src to dest', () => {
    const testDir = path.join(tempRoot, 'mergeDirectoriesTest')
    const srcDir = path.join(testDir, 'src')
    const destDir = path.join(testDir, 'dest')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.mkdirSync(destDir, { recursive: true })

    // Create a file in srcDir.
    fs.writeFileSync(path.join(srcDir, 'test.txt'), 'hello')

    // Create a nested directory with a file.
    const nestedDir = path.join(srcDir, 'subdir')
    fs.mkdirSync(nestedDir)
    fs.writeFileSync(path.join(nestedDir, 'sub.txt'), 'nested')

    mergeDirectories(srcDir, destDir)

    // Verify srcDir has been removed.
    assert.ok(!fs.existsSync(srcDir), 'Source directory should be removed')

    // Verify file has been moved.
    const movedFile = path.join(destDir, 'test.txt')
    assert.ok(fs.existsSync(movedFile), 'File should be moved to destination')
    assert.strictEqual(fs.readFileSync(movedFile, 'utf-8'), 'hello')

    // Verify nested file has been moved.
    const movedNestedFile = path.join(destDir, 'subdir', 'sub.txt')
    assert.ok(fs.existsSync(movedNestedFile), 'Nested file should be moved')
    assert.strictEqual(fs.readFileSync(movedNestedFile, 'utf-8'), 'nested')
  })

  test('mergeJsonFiles: merges JSON files and deletes originals', () => {
    const testDir = path.join(tempRoot, 'mergeJsonTest')
    const srcDir1 = path.join(testDir, 'src1')
    const srcDir2 = path.join(testDir, 'src2')
    const targetDir = path.join(testDir, 'target')
    fs.mkdirSync(srcDir1, { recursive: true })
    fs.mkdirSync(srcDir2, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })

    // Write package.json files in source directories.
    const pkg1 = { scripts: { test: 'echo test' } }
    const pkg2 = { scripts: { build: 'echo build' } }
    fs.writeFileSync(
      path.join(srcDir1, 'package.json'),
      JSON.stringify(pkg1, null, 2)
    )
    fs.writeFileSync(
      path.join(srcDir2, 'package.json'),
      JSON.stringify(pkg2, null, 2)
    )

    mergeJsonFiles([srcDir1, srcDir2], targetDir, 'package.json')

    const mergedPath = path.join(targetDir, 'package.json')
    assert.ok(fs.existsSync(mergedPath), 'Merged JSON file should exist')
    const mergedData = JSON.parse(fs.readFileSync(mergedPath, 'utf-8'))
    assert.deepStrictEqual(mergedData, {
      scripts: { test: 'echo test', build: 'echo build' },
    })

    // Check that original files have been deleted.
    assert.ok(
      !fs.existsSync(path.join(srcDir1, 'package.json')),
      'Original file in srcDir1 should be deleted'
    )
    assert.ok(
      !fs.existsSync(path.join(srcDir2, 'package.json')),
      'Original file in srcDir2 should be deleted'
    )
  })

  test('replaceFunctionReferences: updates file content correctly', () => {
    const testDir = path.join(tempRoot, 'replaceFunctionTest')
    fs.mkdirSync(testDir, { recursive: true })
    const testFile = path.join(testDir, 'index.js')
    const originalContent = `
      import something from "../../functions/src/utils";
      const ref = require('../functions/src/lib');
      const config = "../../functions/.pikku/config";
    `
    fs.writeFileSync(testFile, originalContent, 'utf-8')

    replaceFunctionReferences(testDir)

    const updatedContent = fs.readFileSync(testFile, 'utf-8')
    assert.ok(
      updatedContent.includes('./utils'),
      'Should replace "../../functions/src/" with "./"'
    )
    assert.ok(
      updatedContent.includes('./lib'),
      'Should replace "../functions/src/" with "./"'
    )
    assert.ok(
      updatedContent.includes('../.pikku/config'),
      'Should replace "../../functions/.pikku/" with "../.pikku/"'
    )
  })

  test('cleanTSConfig: removes extends and resets include', () => {
    const testDir = path.join(tempRoot, 'tsconfigTest')
    fs.mkdirSync(testDir, { recursive: true })
    const tsconfigPath = path.join(testDir, 'tsconfig.json')
    const tsconfig = {
      extends: './base.json',
      include: ['**/*'],
      compilerOptions: { target: 'ES6' },
    }
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8')

    cleanTSConfig(testDir)

    const updatedConfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
    assert.ok(!('extends' in updatedConfig), '"extends" should be removed')
    assert.deepStrictEqual(
      updatedConfig.include,
      ['src/'],
      '"include" should be reset to ["src/"]'
    )
    assert.deepStrictEqual(
      updatedConfig.compilerOptions,
      { target: 'ES6' },
      'Other properties should remain unchanged'
    )
  })

  test('wranglerChanges: updates wranger.toml file content', () => {
    const testDir = path.join(tempRoot, 'wranglerTest')
    fs.mkdirSync(testDir, { recursive: true })
    const wranglerPath = path.join(testDir, 'wranger.toml')
    // For testing, we use a JSON string to simulate TOML content.
    const originalContent = JSON.stringify(
      'compatibility_date = "2020-01-01"\nservice = "pikku-cloudflare-workers"\nanother = "pikku-cloudflare-websockets"'
    )
    fs.writeFileSync(wranglerPath, originalContent, 'utf-8')

    const appName = 'myApp'
    wranglerChanges(testDir, appName)

    const updatedContent = fs.readFileSync(wranglerPath, 'utf-8')
    const currentDate = new Date().toISOString().split('T')[0]
    assert.ok(
      updatedContent.includes(`compatibility_date = "${currentDate}"`),
      'compatibility_date should be updated'
    )
    assert.ok(
      updatedContent.includes(appName),
      'service name should be updated to appName'
    )
  })

  test('serverlessChanges: updates serverless.yml file content', () => {
    const testDir = path.join(tempRoot, 'serverlessTest')
    fs.mkdirSync(testDir, { recursive: true })
    const serverlessPath = path.join(testDir, 'serverless.yml')
    // Use a JSON string for testing purposes.
    const originalContent = JSON.stringify(
      'service: pikku-serverless-example\nservice: pikku-serverless-ws-example\narn:aws:iam::014498637088:policy/PikkuServerlessDB'
    )
    fs.writeFileSync(serverlessPath, originalContent, 'utf-8')

    const appName = 'myServerlessApp'
    serverlessChanges(testDir, appName)

    const updatedContent = fs.readFileSync(serverlessPath, 'utf-8')
    assert.ok(
      updatedContent.includes(`service: ${appName}`),
      'service name should be updated'
    )
    assert.ok(
      updatedContent.includes(
        'arn:aws:iam::<account_id>:policy/<database-policy>'
      ),
      'policy ARN should be updated'
    )
  })

  test('updatePackageJSONScripts: updates package.json content', () => {
    const testDir = path.join(tempRoot, 'pkgjsonTest')
    fs.mkdirSync(testDir, { recursive: true })
    const pkgPath = path.join(testDir, 'package.json')
    const pkgContent = {
      scripts: {
        build: 'npm run build',
        test: 'npm run test',
        tsc: 'tsc',
        ncu: 'ncu',
      },
      name: 'oldName',
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkgContent, null, 2), 'utf-8')

    updatePackageJSONScripts(testDir, 'newApp', 'yarn')

    const updatedPackage = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    assert.strictEqual(
      updatedPackage.name,
      'newApp',
      'Package name should be updated'
    )
    assert.ok(
      !('tsc' in updatedPackage.scripts),
      'tsc script should be removed'
    )
    assert.ok(
      !('ncu' in updatedPackage.scripts),
      'ncu script should be removed'
    )
    // Verify that "npm run" was replaced with "yarn run"

    console.log(updatedPackage)
    assert.ok(
      updatedPackage.scripts.build.includes('yarn run'),
      'build script should be updated'
    )
    assert.ok(
      updatedPackage.scripts.test.includes('yarn run'),
      'test script should be updated'
    )
  })
})
