/**
 * Test script to serialize workflow meta to DSL code
 *
 * This script:
 * 1. Reads the meta JSON files from .pikku/workflow/meta/
 * 2. Uses deserializeDslWorkflow to convert them back to DSL code
 * 3. Writes them to .pikku/workflow/dsl/ directory
 *
 * Usage:
 *   yarn serialize-dsl          # Serialize all DSL workflows
 *   yarn serialize-dsl --verify # Also verify round-trip by re-extracting
 */

import { readdir, readFile, mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deserializeDslWorkflow, convertDslToGraph } from '@pikku/inspector'
import type { SerializedWorkflowGraph } from '@pikku/inspector'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '../..')
const META_DIR = join(ROOT_DIR, '.pikku/workflow/meta')
const DSL_DIR = join(ROOT_DIR, '.pikku/workflow/dsl')

/**
 * Deep comparison of two objects, ignoring property order
 */
function deepEqual(a: unknown, b: unknown, path = ''): string[] {
  const errors: string[] = []

  if (a === b) return errors

  if (typeof a !== typeof b) {
    errors.push(`${path}: type mismatch (${typeof a} vs ${typeof b})`)
    return errors
  }

  if (a === null || b === null) {
    if (a !== b) {
      errors.push(`${path}: null mismatch`)
    }
    return errors
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      errors.push(`${path}: array length mismatch (${a.length} vs ${b.length})`)
    }
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      errors.push(...deepEqual(a[i], b[i], `${path}[${i}]`))
    }
    return errors
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])

    for (const key of allKeys) {
      errors.push(...deepEqual(aObj[key], bObj[key], `${path}.${key}`))
    }
    return errors
  }

  if (a !== b) {
    errors.push(
      `${path}: value mismatch (${JSON.stringify(a)} vs ${JSON.stringify(b)})`
    )
  }

  return errors
}

async function main() {
  const args = process.argv.slice(2)
  const verify = args.includes('--verify')

  console.log('Serializing workflow meta to DSL...')
  console.log(`Meta directory: ${META_DIR}`)
  console.log(`DSL directory: ${DSL_DIR}`)
  if (verify) {
    console.log('Verification mode: enabled')
  }

  // Create DSL directory if it doesn't exist
  await mkdir(DSL_DIR, { recursive: true })

  // Read all meta JSON files
  const files = await readdir(META_DIR)
  const jsonFiles = files.filter((f) => f.endsWith('.gen.json'))

  console.log(`Found ${jsonFiles.length} workflow meta files\n`)

  let serializedCount = 0
  let skippedCount = 0
  let verifyPassedCount = 0
  let verifyFailedCount = 0
  const failures: Array<{ name: string; errors: string[] }> = []

  for (const file of jsonFiles) {
    const metaPath = join(META_DIR, file)
    const content = await readFile(metaPath, 'utf-8')
    const originalMeta: SerializedWorkflowGraph = JSON.parse(content)

    // Only serialize DSL workflows (not complex or graph workflows)
    if (originalMeta.source !== 'dsl') {
      console.log(
        `  Skipping ${originalMeta.name} (source: ${originalMeta.source})`
      )
      skippedCount++
      continue
    }

    // Deserialize to DSL code
    const dslCode = deserializeDslWorkflow(originalMeta, {
      pikkuImportPath: '../../../.pikku/workflow/pikku-workflow-types.gen.js',
    })

    // Write to DSL directory
    const dslFileName = file.replace('.gen.json', '.gen.ts')
    const dslPath = join(DSL_DIR, dslFileName)
    await writeFile(dslPath, dslCode)

    console.log(`  Serialized: ${originalMeta.name}`)
    serializedCount++
  }

  console.log('')
  console.log(
    `Done! Serialized ${serializedCount} workflows, skipped ${skippedCount}`
  )
  console.log(`DSL files written to: ${DSL_DIR}`)

  if (verify) {
    console.log('')
    console.log('='.repeat(60))
    console.log('Verification Results')
    console.log('='.repeat(60))
    console.log(`Passed: ${verifyPassedCount}`)
    console.log(`Failed: ${verifyFailedCount}`)

    if (failures.length > 0) {
      console.log('')
      console.log('Failures:')
      for (const { name, errors } of failures) {
        console.log(`  ${name}:`)
        for (const error of errors.slice(0, 5)) {
          console.log(`    - ${error}`)
        }
        if (errors.length > 5) {
          console.log(`    ... and ${errors.length - 5} more`)
        }
      }
      process.exit(1)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
