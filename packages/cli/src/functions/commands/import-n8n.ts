import { existsSync } from 'fs'
import { basename, isAbsolute, join, resolve } from 'path'
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'
import { registryUrl } from '../../utils/remote-addon-sync.js'
import {
  dropUnpublished,
  namespacesUsed,
  startFile,
  triggerOf,
  wiredPackages,
} from './import-n8n-next.js'

/**
 * Which of these `@pikku/addon-*` packages the registry publishes. Undefined when the registry cannot be reached: the
 * caller then claims nothing rather than dropping a package that exists.
 */
async function publishedPackages(
  registry: string,
  packages: string[]
): Promise<Set<string> | undefined> {
  const published = new Set<string>()
  try {
    for (const pkg of packages) {
      const url = new URL('/registry/addons/search', registry)
      url.searchParams.set('query', pkg.replace('@pikku/addon-', ''))
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return undefined
      const entries = (await response.json()) as Array<{ name?: string }>
      if (Array.isArray(entries) && entries.some((e) => e.name === pkg))
        published.add(pkg)
    }
  } catch {
    return undefined
  }
  return published
}

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
  logger: ImportLogger,
  registry?: string
): Promise<boolean> {
  // Imported here: the n8n importer loads the TypeScript compiler, which no
  // other command run needs.
  const { parseN8n, generateWorkflowFromN8n } =
    await import('@pikku/n8n-import')
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

  // The trigger node is not part of the graph: write what starts it (an HTTP route or a schedule).
  const graphKey = Object.keys(files).find((f) => f.endsWith('.graph.ts'))
  const dir = graphKey ? graphKey.slice(0, graphKey.lastIndexOf('/')) : ''
  const start = startFile(parsed.name, parsed.slug, triggerOf(raw as never))
  if (graphKey)
    files[`${dir ? dir + '/' : ''}${parsed.slug}.start.ts`] = start.code

  // A guessed addon package that the registry does not publish would fail `pikku all` (PKU340): leave it out.
  const addonsKey = Object.keys(files).find((f) => f.endsWith('.addons.gen.ts'))
  const wired = wiredPackages(addonsKey ? files[addonsKey] : undefined)
  const nsToPkg = new Map(wired.map((w) => [w.name, w.pkg]))
  const needed = new Set<string>()
  for (const ns of namespacesUsed(files))
    needed.add(nsToPkg.get(ns) ?? `@pikku/addon-${ns}`)
  for (const w of wired) needed.add(w.pkg)
  const published = registry
    ? await publishedPackages(
        registry,
        [...needed].filter((p) => p !== '@pikku/addon-graph')
      )
    : undefined
  published?.add('@pikku/addon-graph')
  const unpublished = new Set(
    published ? [...needed].filter((p) => !published.has(p)) : []
  )
  if (addonsKey && unpublished.size) {
    const rest = dropUnpublished(files[addonsKey], unpublished)
    if (rest) files[addonsKey] = rest
    else delete files[addonsKey]
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
  const keptInstances = credentialInstances.filter(
    (i) =>
      !unpublished.has(wired.find((w) => w.name === i.instanceName)?.pkg ?? '')
  )
  if (keptInstances.length > 0) {
    logger.info(
      `  ${keptInstances.length} addon instance(s) wired in ${parsed.slug}.addons.gen.ts: ${keptInstances
        .map((i) => i.instanceName)
        .join(', ')}`
    )
  }
  // Judge by the path inside the output dir: baseDir itself may contain
  // "/functions/" (packages/functions/...), which is not a stub.
  const stubFiles = Object.keys(files).filter((f) => f.includes('/functions/'))
  if (stubFiles.length > 0) {
    logger.info(
      `  ${stubFiles.length} stub function(s) to implement — run the pikku-n8n-import skill to fill them in:`
    )
    for (const f of stubFiles) logger.info(`    ${join(baseDir, f)}`)
  }
  if (graphKey)
    logger.info(
      `  start wiring: ${start.wiring} (${join(baseDir, dir, parsed.slug + '.start.ts')})`
    )
  if (unpublished.size)
    logger.info(
      `  no published addon for ${[...unpublished].join(', ')}: its nodes stay stubs and must be reported as missing integrations, not invented`
    )
  const install = [...needed]
    .filter((p) => !unpublished.has(p))
    .map((p) => p.replace('@pikku/addon-', ''))
  if (install.length)
    logger.info(
      `  next: ${install.map((n) => `pikku addons add ${n}`).join(' && ')}  then  pikku all --tsc-summary`
    )
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
    const registry = registryUrl(config)
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
      if (!(await importOne(job, baseDir, logger, registry))) failed++
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
