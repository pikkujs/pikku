#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const main = async (output: string, input?: string) => {
  let execDirectory = process.cwd()
  let inputPath = `${__dirname}/../node_modules/kysely-codegen/dist/db.d.ts`
  if (input) {
    inputPath = `${execDirectory}/${input}`
  }

  let kysely: string
  try {
    kysely = await readFile(inputPath, 'utf8')
  } catch {
    console.error(`Could not read file ${input}`)
    process.exit(1)
  }

  kysely = kysely
    .replace(
      new RegExp('^export\\s+type\\s+Generated<[^>]+>.*?;\\s*$', 'ms'),
      ''
    )
    .replace(/Generated<(.*)>/g, '$1')
    .replace(/export type Numeric =.*;/, 'string | number')
    .replace(/export type Timestamp =.*;/, 'export type Timestamp = Date')

  console.log('Writing kysely-pure.gen.ts')

  const outputPath = `${execDirectory}/${output}`
  const outputDirectory = dirname(outputPath)
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(outputPath, kysely, 'utf-8')
  console.log(outputPath)
}

if (process.argv.length !== 4) {
  console.error('Expected the following usage:')
  console.error('node kysely-pure.js <output> <input>')
  process.exit(1)
}

const [, , output, input] = process.argv
main(output!, input)
