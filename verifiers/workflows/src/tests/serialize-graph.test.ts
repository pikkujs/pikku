/**
 * Test script to serialize workflow meta to Graph code
 *
 * This script:
 * 1. Reads the meta JSON files from .pikku/workflow/meta/
 * 2. Uses deserializeGraphWorkflow to convert them to pikkuWorkflowGraph code
 * 3. Writes them to src/workflows/graphs/ directory
 *
 * Usage:
 *   yarn serialize-graph
 */

import { readdir, readFile, mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deserializeGraphWorkflow } from '@pikku/inspector'
import type { SerializedWorkflowGraph } from '@pikku/inspector'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '../..')
const META_DIR = join(ROOT_DIR, '.pikku/workflow/meta')
const GRAPH_DIR = join(ROOT_DIR, 'src/graphs')

async function main() {
  console.log('Serializing workflow meta to Graph code...')
  console.log(`Meta directory: ${META_DIR}`)
  console.log(`Graph directory: ${GRAPH_DIR}`)

  // Create graph directory if it doesn't exist
  await mkdir(GRAPH_DIR, { recursive: true })

  // Read all meta JSON files
  const files = await readdir(META_DIR)
  const jsonFiles = files.filter((f) => f.endsWith('.gen.json'))

  console.log(`Found ${jsonFiles.length} workflow meta files\n`)

  let serializedCount = 0
  let skippedCount = 0

  for (const file of jsonFiles) {
    const metaPath = join(META_DIR, file)
    const content = await readFile(metaPath, 'utf-8')
    const originalMeta: SerializedWorkflowGraph = JSON.parse(content)

    // Only serialize DSL workflows (not complex or already graph workflows)
    if (originalMeta.source !== 'dsl') {
      console.log(
        `  Skipping ${originalMeta.name} (source: ${originalMeta.source})`
      )
      skippedCount++
      continue
    }

    // Modify the name to add 'graph' prefix
    const graphMeta: SerializedWorkflowGraph = {
      ...originalMeta,
      name: `graph${originalMeta.name.charAt(0).toUpperCase()}${originalMeta.name.slice(1)}`,
      source: 'graph',
    }

    // Deserialize to Graph code
    const graphCode = deserializeGraphWorkflow(graphMeta, {
      pikkuImportPath: '../../.pikku/workflow/pikku-workflow-types.gen.js',
    })

    // Write to graph directory with 'graph' prefix and .gen.ts extension
    const baseName = file.replace('.gen.json', '')
    const graphFileName = `graph${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}.gen.ts`
    const graphPath = join(GRAPH_DIR, graphFileName)
    await writeFile(graphPath, graphCode)

    console.log(`  Serialized: ${originalMeta.name} -> ${graphMeta.name}`)
    serializedCount++
  }

  console.log('')
  console.log(
    `Done! Serialized ${serializedCount} workflows, skipped ${skippedCount}`
  )
  console.log(`Graph files written to: ${GRAPH_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
