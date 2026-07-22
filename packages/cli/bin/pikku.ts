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

/**
 * Load `.env` from the working directory into process.env, so `pikku dev`,
 * `pikku db migrate` and friends see the secrets a project keeps there —
 * LocalSecretService reads process.env and nothing else, so without this the
 * first sign-up fails with "Requested secret not found".
 *
 * Cannot be left to the package manager: the CLI has a node shebang, so `bunx
 * pikku dev` execs node and bun's own .env injection never reaches the process.
 * Existing variables win — a real env var must always beat a checked-out file.
 */
function loadEnvFile(): void {
  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  try {
    process.loadEnvFile(envPath)
  } catch (error: any) {
    process.stderr.write(`  Could not read .env: ${error.message}\n`)
  }
}

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
    loadEnvFile()
    const { PikkuCLI } = await import(pathToFileURL(pikkuCliPath).href)
    const updateCheck = checkForUpdate()
    await PikkuCLI(process.argv.slice(2))
    await updateCheck
    process.exit(process.exitCode ?? 0)
  } catch (error: any) {
    console.error('Failed to run Pikku CLI:', error.message)
    process.exit(1)
  }
} else {
  console.error('Pikku CLI not found. Run build.sh first.')
  process.exit(1)
}
