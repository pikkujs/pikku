#!/usr/bin/env tsx

/**
 * Validate that all error codes in packages/inspector/src/error-codes.ts
 * have corresponding documentation files in website/errors/
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Paths
const ERROR_CODES_FILE = join(
  __dirname,
  '../packages/inspector/src/error-codes.ts'
)
const WEBSITE_ERRORS_DIR = join(
  __dirname,
  '../../website/docs/pikku-cli/errors'
)

function extractErrorCodes(fileContent: string): string[] {
  const errorCodes: string[] = []
  const enumMatch = fileContent.match(/export enum ErrorCode \{([\s\S]*?)\}/m)

  if (!enumMatch) {
    throw new Error('Could not find ErrorCode enum in error-codes.ts')
  }

  const enumContent = enumMatch[1]
  const codeRegex = /=\s*'(PKU\d+)'/g
  let match: RegExpExecArray | null

  while ((match = codeRegex.exec(enumContent)) !== null) {
    errorCodes.push(match[1])
  }

  return errorCodes
}

function getExistingErrorDocs(errorsDir: string): string[] {
  if (!existsSync(errorsDir)) {
    console.error(`Error: Website errors directory not found: ${errorsDir}`)
    process.exit(1)
  }

  const files = readdirSync(errorsDir)
  return files
    .filter((file) => file.match(/^pku\d+\.md$/i))
    .map((file) => file.replace(/\.md$/i, '').toUpperCase())
}

function main(): void {
  console.log('🔍 Validating error code documentation...\n')

  // Read error codes from source
  const errorCodesContent = readFileSync(ERROR_CODES_FILE, 'utf-8')
  const errorCodes = extractErrorCodes(errorCodesContent)

  console.log(`Found ${errorCodes.length} error codes in error-codes.ts`)

  // Read existing docs
  const existingDocs = getExistingErrorDocs(WEBSITE_ERRORS_DIR)
  console.log(`Found ${existingDocs.length} error documentation files\n`)

  // Find missing docs
  const missingDocs = errorCodes.filter((code) => !existingDocs.includes(code))

  // Find extra docs (docs that don't have corresponding error codes)
  const extraDocs = existingDocs.filter((doc) => !errorCodes.includes(doc))

  // Report results
  if (missingDocs.length === 0 && extraDocs.length === 0) {
    console.log('✅ All error codes have corresponding documentation!')
    console.log('✅ No orphaned documentation files found!')
    process.exit(0)
  }

  let hasErrors = false

  if (missingDocs.length > 0) {
    hasErrors = true
    console.log('❌ Missing documentation for the following error codes:\n')
    missingDocs.forEach((code) => {
      console.log(
        `   - ${code} (create: website/docs/pikku-cli/errors/${code.toLowerCase()}.md)`
      )
    })
    console.log()
  }

  if (extraDocs.length > 0) {
    console.log(
      '⚠️  Found documentation files without corresponding error codes:\n'
    )
    extraDocs.forEach((doc) => {
      console.log(
        `   - ${doc} (website/docs/pikku-cli/errors/${doc.toLowerCase()}.md)`
      )
    })
    console.log()
  }

  // Summary
  console.log('📊 Summary:')
  console.log(`   Total error codes: ${errorCodes.length}`)
  console.log(`   Documented: ${errorCodes.length - missingDocs.length}`)
  console.log(`   Missing docs: ${missingDocs.length}`)
  console.log(`   Extra docs: ${extraDocs.length}`)

  if (hasErrors) {
    process.exit(1)
  }
}

main()
