#!/usr/bin/env node
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && w.message.includes('SQLite')) return
  process.stderr.write(`${w.name}: ${w.message}\n`)
})
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function checkForUpdate(): Promise<void> {
  if (process.env.CI || !process.stderr.isTTY) return
  try {
    const { version: current } = JSON.parse(
      readFileSync(join(__dirname, '../package.json'), 'utf-8')
    )
    const res = await fetch('https://registry.npmjs.org/@pikku/cli/latest', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return
    const { version: latest } = (await res.json()) as { version: string }
    if (latest !== current) {
      process.stderr.write(
        `\n  Update available  ${current} → ${latest}\n  brew upgrade pikku  or  npm install -g @pikku/cli\n\n`
      )
    }
  } catch {
    // never block the CLI for a network check
  }
}

// Use the generated Pikku CLI
const pikkuCliPath = join(__dirname, '../.pikku/cli/pikku-cli.gen.js')

if (existsSync(pikkuCliPath)) {
  try {
    const { PikkuCLI } = await import(pathToFileURL(pikkuCliPath).href)
    const updateCheck = checkForUpdate()
    await PikkuCLI(process.argv.slice(2))
    await updateCheck
    process.exit(0)
  } catch (error: any) {
    console.error('Failed to run Pikku CLI:', error.message)
    process.exit(1)
  }
} else {
  console.error('Pikku CLI not found. Run build.sh first.')
  process.exit(1)
}
