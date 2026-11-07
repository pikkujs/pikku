#!/usr/bin/env bun
/**
 * Generates Go's outputs for every project: the answer key.
 *
 *   bun golden.ts [goBin] [--out dir] [--schemas] [--projects list] [--jobs N] [--timeout s]
 *
 * Writes <out>/golden/<project>.json (raw stdout), <project>.normalised.json,
 * <project>.request.json, and golden/index.json (exit codes, timings, RSS,
 * errors). Shares the content-addressed cache with parity.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_GO, DEFAULT_OUT, buildRequest, cachedRun, discoverProjects, filterProjects, normalise, parseJson, pool, projectName, sh } from './lib.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: DEFAULT_OUT },
    schemas: { type: 'boolean', default: false },
    projects: { type: 'string' },
    jobs: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '300' },
    'no-cache': { type: 'boolean', default: false },
  },
})
const goBin = positionals[0] ?? DEFAULT_GO
const dir = join(values.out!, 'golden')
mkdirSync(dir, { recursive: true })
const projects = filterProjects(discoverProjects(), values.projects)
const started = performance.now()
const index = await pool(projects, Number(values.jobs), async (p) => {
  const name = projectName(p)
  const file = name.replace(/\//g, '__')
  const request = await buildRequest(p, values.schemas!)
  const r = await cachedRun({ bin: goBin, args: ['--stdin'], stdin: request, timeoutMs: Number(values.timeout) * 1000, cacheDir: values['no-cache'] ? undefined : join(values.out!, 'go-cache') })
  writeFileSync(join(dir, `${file}.request.json`), request)
  writeFileSync(join(dir, `${file}.json`), r.stdout)
  writeFileSync(join(dir, `${file}.normalised.json`), normalise(r.stdout).text)
  const j = parseJson(r.stdout)
  const error = r.timedOut ? 'timeout' : r.exitCode !== 0 ? `exit ${r.exitCode}: ${r.stderr.trim().split('\n')[0]}` : j?.error
  console.error(`${name}: ${error ? 'FAIL ' + String(error).split('\n')[0] : 'ok'} ${sh(r.wallMs)}${r.cached ? ' (cached)' : ''}`)
  return { project: name, exitCode: r.exitCode, error: error ?? null, wallMs: r.wallMs, peakRssKb: r.peakRssKb, bytes: r.stdout.length }
})
writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2))
console.log(`${index.length} projects, ${index.filter((i) => i.error).length} Go failures, golden in ${dir} (${sh(performance.now() - started)} elapsed, cumulative per-project ${sh(index.reduce((a, i) => a + i.wallMs, 0))})`)
