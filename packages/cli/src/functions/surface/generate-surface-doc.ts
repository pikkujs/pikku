import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
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
const usage = `Usage: generate-surface-doc --app <dir> --addon <dir> --snippets <dir> --out <file> [--snippets-out <file>]`

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

const main = async (argv: string[]): Promise<void> => {
  const args = parseArgs(argv)
  const { app, addon, out, snippets: snippetsDir } = args
  const snippetsOut = args['snippets-out']
  if (!app || !addon || !out || !snippetsDir) throw new Error(usage)

  const snippets = await collectSnippets(resolve(snippetsDir))

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
