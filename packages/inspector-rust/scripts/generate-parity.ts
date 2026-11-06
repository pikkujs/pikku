#!/usr/bin/env bun
/**
 * Real-CLI parity: runs `pikku all` on every project once with the Go inspector
 * and once with the Rust inspector, records every request the CLI sends, replays
 * the Go run's requests against both binaries and diffs the generated trees.
 *
 *   bun generate-parity.ts <goBin> <rsBin> --cli <pikku.js> [--projects a,b*] [--out dir]
 *                          [--timeout seconds] [--cap N]
 *
 * Per project and engine:
 *   1. `git clean` the project dir and its rootDir (ignored files, then untracked ones,
 *      node_modules kept), so the CLI starts from the committed tree: scaffold files
 *      (`pikku/`, `.pikku/`, ...) from an earlier run would otherwise leak into the
 *      next engine's source list.
 *   2. Run `node <cli> all` in the project dir with PIKKU_INSPECTOR_GO_BIN (and _RS_BIN)
 *      pointing at capture-wrapper.sh, which tees every request to
 *      <out>/captured/<project>/<engine>/ and execs the real binary. The generated tree
 *      is the default outDir, because the CLI's Zod schema step imports from `.pikku/`
 *      of the project and cannot be redirected.
 *   3. Harvest everything the run left behind (git status: untracked, ignored, modified,
 *      node_modules excluded) into <out>/trees/<project>/<engine>/.
 *   4. After the Go run only, while the state is intact: replay each captured request
 *      against Go and Rust and compare the normalised stdout byte for byte.
 * Then the two harvested trees are compared file by file.
 *
 * Excluded from the harvest: node_modules and `.pikku/runs/` (per-run logs named after a timestamp).
 * Tree normalisations: none beyond those in TREE_NORMALISATIONS (both runs use the same
 * project path and outDir, so no path needs rewriting).
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DEFAULT_OUT,
  REPO_ROOT,
  discoverProjects,
  discoverTracked,
  filterProjects,
  normalise,
  projectName,
  runBinary,
} from './lib.ts'

export const TREE_NORMALISATIONS: [string, RegExp, string][] = []

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cli: { type: 'string' },
    projects: { type: 'string' },
    corpus: { type: 'string', default: 'default' },
    out: { type: 'string', default: DEFAULT_OUT + '-generate' },
    timeout: { type: 'string', default: '600' },
    cap: { type: 'string', default: '3' },
  },
})
const [goBin, rsBin] = positionals
if (!goBin || !rsBin || !values.cli) {
  console.error('usage: generate-parity.ts <goBin> <rsBin> --cli <pikku.js> [--projects list] [--out dir]')
  process.exit(2)
}
const out = values.out!
const timeoutMs = Number(values.timeout) * 1000
const WRAPPER = join(dirname(new URL(import.meta.url).pathname), 'capture-wrapper.sh')

const git = (args: string[]) =>
  spawnSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })

const rootDirOf = (projectDir: string): string => {
  const read = (file: string): any => {
    const c = JSON.parse(readFileSync(file, 'utf8'))
    const d = dirname(file)
    if (!c.extends) return { rootDir: resolve(d, c.rootDir ?? '.') }
    const base = read(resolve(d, c.extends))
    return { rootDir: c.rootDir ? resolve(d, c.rootDir) : base.rootDir }
  }
  return read(join(projectDir, 'pikku.config.json')).rootDir
}

const clean = (dirs: string[]) => {
  for (const d of dirs) {
    const rel = relative(REPO_ROOT, d)
    git(['checkout', '--', rel])
    git(['clean', '-fdXq', '--', rel])
    git(['clean', '-fdq', '-e', 'node_modules', '--', rel])
  }
}

/** Files the run left behind or changed, as repo-relative paths. */
const leftovers = (dirs: string[]): string[] => {
  const files = new Set<string>()
  for (const d of dirs) {
    const rel = relative(REPO_ROOT, d)
    for (const args of [
      ['ls-files', '-z', '-o', '--exclude-standard', '--', rel],
      ['ls-files', '-z', '-o', '-i', '--exclude-standard', '--', rel],
      ['diff', '-z', '--name-only', '--', rel],
    ]) {
      for (const path of git(args).stdout.split('\0')) {
        if (!path || path.split('/').includes('node_modules') || /(^|\/)\.pikku\/runs\//.test(path)) continue
        files.add(path)
      }
    }
  }
  return [...files].sort()
}

const harvest = (files: string[], dest: string) => {
  rmSync(dest, { recursive: true, force: true })
  for (const f of files) {
    const src = join(REPO_ROOT, f)
    if (!existsSync(src) || !statSync(src).isFile()) continue
    mkdirSync(dirname(join(dest, f)), { recursive: true })
    copyFileSync(src, join(dest, f))
  }
}

const runCli = (projectDir: string, bin: string, captureDir: string) => {
  rmSync(captureDir, { recursive: true, force: true })
  const started = Date.now()
  const r = spawnSync('node', [values.cli!, 'all'], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1 << 28,
    env: {
      ...process.env,
      PIKKU_INSPECTOR: '',
      PIKKU_INSPECTOR_GO_BIN: WRAPPER,
      PIKKU_INSPECTOR_RS_BIN: WRAPPER,
      CAPTURE_DIR: captureDir,
      CAPTURE_REAL_BIN: bin,
    },
  })
  return {
    exit: r.status,
    signal: r.signal,
    ms: Date.now() - started,
    log: (r.stdout ?? '') + (r.stderr ?? ''),
  }
}

const listFiles = (root: string): string[] => {
  const found: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name))
      else found.push(relative(root, join(d, e.name)))
    }
  }
  if (existsSync(root)) walk(root)
  return found.sort()
}

const normaliseTree = (text: string) => {
  for (const [, re, to] of TREE_NORMALISATIONS) text = text.replace(re, to)
  return text
}

interface TreeDiff {
  onlyGo: string[]
  onlyRs: string[]
  different: string[]
  same: number
}

const compareTrees = (goTree: string, rsTree: string, diffDir: string): TreeDiff => {
  const g = listFiles(goTree)
  const r = listFiles(rsTree)
  const gs = new Set(g)
  const rset = new Set(r)
  const res: TreeDiff = { onlyGo: g.filter((f) => !rset.has(f)), onlyRs: r.filter((f) => !gs.has(f)), different: [], same: 0 }
  rmSync(diffDir, { recursive: true, force: true })
  for (const f of g.filter((f) => rset.has(f))) {
    const a = normaliseTree(readFileSync(join(goTree, f), 'utf8'))
    const b = normaliseTree(readFileSync(join(rsTree, f), 'utf8'))
    if (a === b) {
      res.same++
      continue
    }
    res.different.push(f)
    mkdirSync(diffDir, { recursive: true })
    const ta = join(diffDir, '.a')
    const tb = join(diffDir, '.b')
    writeFileSync(ta, a)
    writeFileSync(tb, b)
    const d = spawnSync('diff', ['-u', '--label', `go/${f}`, '--label', `rs/${f}`, ta, tb], { encoding: 'utf8', maxBuffer: 1 << 28 })
    writeFileSync(join(diffDir, f.replace(/\//g, '__') + '.diff'), d.stdout)
    rmSync(ta)
    rmSync(tb)
  }
  return res
}

interface Replay {
  requests: number
  identical: number
  different: { file: string; args: string; firstDiff: string }[]
}

const replay = async (captureDir: string): Promise<Replay> => {
  const files = existsSync(captureDir) ? readdirSync(captureDir).filter((f) => f.endsWith('.in')).sort() : []
  const res: Replay = { requests: files.length, identical: 0, different: [] }
  for (const f of files) {
    const args = readFileSync(join(captureDir, f.replace(/\.in$/, '.args')), 'utf8').split('\n').filter(Boolean)
    const stdin = readFileSync(join(captureDir, f), 'utf8')
    const [go, rs] = await Promise.all([runBinary(goBin, args, stdin, timeoutMs), runBinary(rsBin, args, stdin, timeoutMs)])
    const a = normalise(go.stdout).text
    const b = normalise(rs.stdout).text
    if (a === b && go.exitCode === rs.exitCode) res.identical++
    else {
      let i = 0
      while (i < a.length && a[i] === b[i]) i++
      res.different.push({ file: f, args: args.join(' '), firstDiff: `offset ${i}: go=${JSON.stringify(a.slice(Math.max(0, i - 80), i + 80))} rs=${JSON.stringify(b.slice(Math.max(0, i - 80), i + 80))}` })
    }
  }
  return res
}

// corpus: default = templates/ recipes/ verifiers/ (64); tracked = every tracked pikku.config.json;
// extra = tracked minus default.
const defaultSet = new Set(discoverProjects())
const pool0 = values.corpus === 'tracked' ? discoverTracked() : values.corpus === 'extra' ? discoverTracked().filter((d) => !defaultSet.has(d)) : [...defaultSet].sort()
const projects = filterProjects(pool0, values.projects)
const summary: any[] = []
const completed = (log: string) => log.includes('pikku all (completed')
for (const dir of projects) {
  const name = projectName(dir)
  const slug = name.replace(/\//g, '__')
  const dirs = [...new Set([dir, rootDirOf(dir)])]
  const rec: any = { project: name, phases: { cold: {}, warm: {} } }
  console.error(`== ${name}`)
  // cold = from a clean checkout; warm = a second `pikku all` over the first run's
  // output, as in a dev loop. Each engine starts from its own clean checkout.
  for (const engine of ['go', 'rs'] as const) {
    clean(dirs)
    for (const phase of ['cold', 'warm'] as const) {
      const capDir = join(out, 'captured', name, phase, engine)
      const run = runCli(dir, engine === 'go' ? goBin : rsBin, capDir)
      mkdirSync(join(out, 'logs'), { recursive: true })
      writeFileSync(join(out, 'logs', `${slug}.${phase}.${engine}.log`), run.log)
      const left = leftovers(dirs)
      harvest(left, join(out, 'trees', name, phase, engine))
      const requests = existsSync(capDir) ? readdirSync(capDir).filter((f) => f.endsWith('.in')).length : 0
      const ph = rec.phases[phase]
      ph[engine] = { exit: run.exit, completed: completed(run.log), signal: run.signal, ms: run.ms, requests, files: left.length }
      if (engine === 'go') ph.replay = await replay(capDir)
      console.error(`   ${phase} ${engine}: exit ${run.exit}${completed(run.log) ? '' : ' (NOT completed)'}, ${requests} requests, ${left.length} files, ${(run.ms / 1000).toFixed(1)}s`)
    }
  }
  clean(dirs)
  rec.treeIdentical = true
  for (const phase of ['cold', 'warm'] as const) {
    const ph = rec.phases[phase]
    ph.tree = compareTrees(join(out, 'trees', name, phase, 'go'), join(out, 'trees', name, phase, 'rs'), join(out, 'diffs', name, phase))
    const t = ph.tree as TreeDiff
    ph.treeIdentical = !t.onlyGo.length && !t.onlyRs.length && !t.different.length
    rec.treeIdentical &&= ph.treeIdentical
    console.error(`   ${phase}: replay ${ph.replay.identical}/${ph.replay.requests}; tree ${ph.treeIdentical ? 'IDENTICAL' : `DIFFERENT (${t.different.length} differ, ${t.onlyGo.length} only go, ${t.onlyRs.length} only rs)`}`)
  }
  rec.goRunnable = rec.phases.cold.go.completed
  summary.push(rec)
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
}

const runnable = summary.filter((s) => s.goRunnable)
const sum = (f: (p: any) => number) => summary.reduce((a, s) => a + f(s.phases.cold) + f(s.phases.warm), 0)
const lines = ['# Real-CLI parity', '']
lines.push(`projects: ${summary.length}; Go \`pikku all\` completes: ${runnable.length}`)
lines.push(`generated trees identical (cold and warm): ${summary.filter((s) => s.treeIdentical).length} of ${summary.length} (${runnable.filter((s) => s.treeIdentical).length} of ${runnable.length} where Go completes)`)
lines.push(`captured requests identical: ${sum((p) => p.replay.identical)} of ${sum((p) => p.replay.requests)}; projects with all identical: ${summary.filter((s) => ['cold', 'warm'].every((k) => s.phases[k].replay.identical === s.phases[k].replay.requests)).length} of ${summary.length}`, '')
lines.push('Tree normalisations: ' + (TREE_NORMALISATIONS.length ? TREE_NORMALISATIONS.map((n) => n[0]).join('; ') : 'none'), '')
lines.push('| project | go completes | requests cold/warm (go) | replay cold | replay warm | tree cold | tree warm |', '|---|---|---|---|---|---|---|')
const tr = (p: any) => (p.treeIdentical ? 'identical' : `${p.tree.different.length} differ, ${p.tree.onlyGo.length} only go, ${p.tree.onlyRs.length} only rs`)
for (const s of summary) {
  const c = s.phases.cold, w = s.phases.warm
  lines.push(`| ${s.project} | ${s.goRunnable} | ${c.go.requests}/${w.go.requests} | ${c.replay.identical}/${c.replay.requests} | ${w.replay.identical}/${w.replay.requests} | ${tr(c)} | ${tr(w)} |`)
}
for (const s of summary.filter((s) => !s.treeIdentical || ['cold', 'warm'].some((k) => s.phases[k].replay.different.length))) {
  lines.push('', `### ${s.project}`)
  for (const k of ['cold', 'warm']) {
    const p = s.phases[k]
    for (const d of p.replay.different.slice(0, Number(values.cap))) lines.push(`- ${k} request ${d.file} (${d.args}): ${d.firstDiff}`)
    for (const f of p.tree.different.slice(0, 20)) lines.push(`- ${k} differs: ${f}`)
    for (const f of p.tree.onlyGo.slice(0, 20)) lines.push(`- ${k} only in go: ${f}`)
    for (const f of p.tree.onlyRs.slice(0, 20)) lines.push(`- ${k} only in rs: ${f}`)
  }
}
writeFileSync(join(out, 'summary.md'), lines.join('\n'))
console.log(lines.slice(0, 6).join('\n'))
