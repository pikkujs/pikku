import { existsSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { parseN8n, generateWorkflowFromN8n } from '@pikku/n8n-import'

async function writeFiles(
  baseDir: string,
  files: Record<string, string>
): Promise<string[]> {
  const written: string[] = []
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(baseDir, relativePath)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
    written.push(fullPath)
  }
  return written
}

export const pikkuImportN8n = pikkuSessionlessFunc<
  {
    file: string
    out?: string
  },
  void
>({
  func: async ({ logger, config }, { file, out }) => {
    const inputPath = isAbsolute(file) ? file : resolve(process.cwd(), file)
    if (!existsSync(inputPath)) {
      logger.error(`n8n workflow file not found: ${inputPath}`)
      process.exit(1)
    }

    let parsed
    try {
      const raw = JSON.parse(await readFile(inputPath, 'utf-8'))
      parsed = parseN8n(raw)
    } catch (err) {
      logger.error(`Failed to parse n8n workflow: ${(err as Error).message}`)
      process.exit(1)
    }

    const { files, manifest, credentialInstances, diagnostics } =
      generateWorkflowFromN8n(parsed)

    // A single-file import can only resolve self-references; any cross-workflow
    // sub-workflow reference is un-importable here. Report and stop rather than
    // write a partial, un-runnable scaffold.
    if (diagnostics.some((d) => d.type === 'error')) {
      logger.error(`Cannot import "${parsed.name}":`)
      for (const d of diagnostics) {
        logger.error(`  [${d.reason}] ${d.message}`)
      }
      process.exit(1)
    }

    const baseDir = out
      ? isAbsolute(out)
        ? out
        : resolve(process.cwd(), out)
      : config.scaffold?.functionDir || process.cwd()

    const written = await writeFiles(baseDir, files)

    logger.info(
      `Imported "${parsed.name}" (${parsed.shape}) → ${written.length} file(s) in ${baseDir}`
    )
    if (manifest.length > 0) {
      logger.info(
        `  ${manifest.length} integration node(s) recorded in ${parsed.slug}.integrations.json`
      )
    }
    if (credentialInstances.length > 0) {
      logger.info(
        `  ${credentialInstances.length} addon instance(s) wired in ${parsed.slug}.addons.gen.ts: ${credentialInstances
          .map((i) => i.instanceName)
          .join(', ')}`
      )
    }
    const stubCount = written.filter((f) => f.includes('/functions/')).length
    if (stubCount > 0) {
      logger.info(
        `  ${stubCount} stub function(s) to implement — run the pikku-n8n-addon-map / pikku-n8n-code-translate skills to fill them in`
      )
    }
  },
})
