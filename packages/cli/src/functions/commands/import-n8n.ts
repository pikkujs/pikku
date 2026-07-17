import { existsSync } from 'fs'
import { basename, isAbsolute, join, resolve } from 'path'
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
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

type ImportJob = { raw: unknown; nameHint: string }

// A single n8n export file may hold one workflow object, a bare array of
// workflows (n8n `export:workflow --all`), or a `{ workflows: [...] }` wrapper.
// Flatten whichever shape into one job per workflow.
function collectJobs(raw: unknown, nameHint: string, jobs: ImportJob[]): void {
  const list = Array.isArray(raw)
    ? raw
    : raw && Array.isArray((raw as { workflows?: unknown[] }).workflows)
      ? (raw as { workflows: unknown[] }).workflows
      : null
  if (list) {
    list.forEach((wf, i) => {
      const own = (wf as { name?: string })?.name?.trim()
      jobs.push({ raw: wf, nameHint: own || `${nameHint}-${i + 1}` })
    })
  } else {
    jobs.push({ raw, nameHint })
  }
}

type ImportLogger = {
  info: (message: string) => void
  error: (message: string) => void
}

async function importOne(
  { raw, nameHint }: ImportJob,
  baseDir: string,
  logger: ImportLogger
): Promise<boolean> {
  let parsed
  try {
    parsed = parseN8n(raw, nameHint)
  } catch (err) {
    logger.error(`Failed to parse "${nameHint}": ${(err as Error).message}`)
    return false
  }

  const { files, manifest, credentialInstances, diagnostics } =
    generateWorkflowFromN8n(parsed)

  // A single-file import can only resolve self-references; any cross-workflow
  // sub-workflow reference is un-importable here. Report and skip rather than
  // write a partial, un-runnable scaffold.
  if (diagnostics.some((d) => d.type === 'error')) {
    logger.error(`Cannot import "${parsed.name}":`)
    for (const d of diagnostics) {
      logger.error(`  [${d.reason}] ${d.message}`)
    }
    return false
  }

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
      `  ${stubCount} stub function(s) to implement — run the pikku-n8n-import skill to fill them in`
    )
  }
  return true
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

    const baseDir = out
      ? isAbsolute(out)
        ? out
        : resolve(process.cwd(), out)
      : config.scaffold?.functionDir || process.cwd()

    const jobs: ImportJob[] = []
    if ((await stat(inputPath)).isDirectory()) {
      const entries = (await readdir(inputPath))
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .sort()
      if (entries.length === 0) {
        logger.error(`No .json workflow files found in ${inputPath}`)
        process.exit(1)
      }
      for (const entry of entries) {
        try {
          const raw = JSON.parse(
            await readFile(join(inputPath, entry), 'utf-8')
          )
          collectJobs(raw, entry.replace(/\.json$/i, ''), jobs)
        } catch (err) {
          logger.error(`Failed to read ${entry}: ${(err as Error).message}`)
        }
      }
    } else {
      let raw
      try {
        raw = JSON.parse(await readFile(inputPath, 'utf-8'))
      } catch (err) {
        logger.error(`Failed to parse n8n workflow: ${(err as Error).message}`)
        process.exit(1)
      }
      collectJobs(raw, basename(inputPath).replace(/\.json$/i, ''), jobs)
    }

    if (jobs.length === 0) {
      logger.error('No workflows found to import')
      process.exit(1)
    }

    let failed = 0
    for (const job of jobs) {
      if (!(await importOne(job, baseDir, logger))) failed++
    }

    if (jobs.length > 1) {
      const ok = jobs.length - failed
      logger.info(
        `Imported ${ok}/${jobs.length} workflow(s) into ${baseDir}${
          failed > 0 ? ` — ${failed} failed` : ''
        }`
      )
    }

    if (failed > 0) {
      process.exit(1)
    }
  },
})
