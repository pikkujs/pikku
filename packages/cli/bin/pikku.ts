#!/usr/bin/env node
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Use the generated Pikku CLI
const pikkuCliPath = join(__dirname, '../.pikku/cli/pikku-cli.gen.js')

if (existsSync(pikkuCliPath)) {
  try {
    const { PikkuCLI } = await import(pikkuCliPath)
    await PikkuCLI(process.argv.slice(2))
    process.exit(0)
  } catch (error: any) {
    console.error('Failed to run Pikku CLI:', error.message)
    process.exit(1)
  }
} else {
  console.error('Pikku CLI not found. Run build.sh first.')
  process.exit(1)
}
