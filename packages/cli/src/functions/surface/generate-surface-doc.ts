import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getCLIVersion } from '../../utils/get-cli-version.js'
import { buildSurfaceDoc } from './build-surface-doc.js'
import { collectSnippets } from './collect-snippets.js'

/**
 * Build-time entry point: `@pikku/cli` ships the surface doc, so it is computed
 * once when the CLI is built rather than by every project that consumes it.
 * `build.sh` generates the two projects it reads — one application, one addon —
 * and points this at them.
 */
const usage = `Usage: generate-surface-doc --app <dir> --addon <dir> --snippets <dir> --out <file> [--snippets-out <file>] [--snippets-meta-out <file>]`

const parseArgs = (argv: string[]): Record<string, string> => {
  const parsed: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(usage)
    }
    parsed[flag.slice(2)] = value
  }
  return parsed
}

/**
 * The one region a marker cannot reach: `pikku.config.json` is parsed as strict
 * JSON, so the scenario environments a doc has to show cannot be fenced in
 * place. Read straight off the project's own config instead of being retyped.
 */
const addScenarioConfig = async (
  projectDir: string,
  snippets: Map<string, string>,
  origins: Map<string, string>
): Promise<void> => {
  try {
    const config = JSON.parse(
      await readFile(join(projectDir, 'pikku.config.json'), 'utf8')
    )
    if (!config.scenarios) return
    snippets.set(
      'scenarioConfig',
      JSON.stringify({ scenarios: config.scenarios }, null, 2)
    )
    origins.set('scenarioConfig', 'pikku.config.json')
  } catch {
    return
  }
}

const main = async (argv: string[]): Promise<void> => {
  const args = parseArgs(argv)
  const { app, addon, out, snippets: snippetsDir } = args
  const snippetsOut = args['snippets-out']
  if (!app || !addon || !out || !snippetsDir) throw new Error(usage)

  const origins = new Map<string, string>()
  const snippets = await collectSnippets(
    resolve(snippetsDir),
    new Map(),
    origins
  )
  await addScenarioConfig(resolve(snippetsDir), snippets, origins)

  const doc = await buildSurfaceDoc({
    version: getCLIVersion(),
    app: { projectDir: app },
    addon: { projectDir: addon },
    snippets,
  })

  const outFile = resolve(out)
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')

  if (snippetsOut) {
    const snippetsFile = resolve(snippetsOut)
    await mkdir(dirname(snippetsFile), { recursive: true })
    await writeFile(
      snippetsFile,
      `${JSON.stringify(Object.fromEntries([...snippets].sort()), null, 2)}\n`,
      'utf8'
    )
    process.stdout.write(`  snippets: ${snippets.size}\n`)
  }

  const metaOut = args['snippets-meta-out']
  if (metaOut) {
    const metaFile = resolve(metaOut)
    await mkdir(dirname(metaFile), { recursive: true })
    await writeFile(
      metaFile,
      `${JSON.stringify(Object.fromEntries([...origins].sort()), null, 2)}\n`,
      'utf8'
    )
  }

  for (const entryPoint of doc.entryPoints) {
    const symbols = entryPoint.leaves.reduce(
      (total, leaf) => total + leaf.symbols.length,
      0
    )
    process.stdout.write(
      `  ${entryPoint.id}: ${entryPoint.leaves.length} leaves, ${symbols} exports\n`
    )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main(process.argv.slice(2))
}
