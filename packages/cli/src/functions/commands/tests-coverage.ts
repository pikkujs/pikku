import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { pikkuSessionlessFunc } from '#pikku'

type Status = 'covered' | 'partial' | 'uncovered' | 'unknown'

type IstanbulFile = {
  statementMap: Record<
    string,
    {
      start: { line: number; column: number }
      end: { line: number; column: number }
    }
  >
  s: Record<string, number>
}

function innerBody(init: ts.Expression): ts.ConciseBody | null {
  if (!ts.isCallExpression(init)) return null
  for (const arg of init.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return arg.body
    if (ts.isObjectLiteralExpression(arg)) {
      for (const p of arg.properties) {
        if (
          ts.isPropertyAssignment(p) &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'func' &&
          (ts.isArrowFunction(p.initializer) ||
            ts.isFunctionExpression(p.initializer))
        )
          return p.initializer.body
      }
    }
  }
  return null
}

function bodySpan(
  file: string,
  exportedName: string,
  astCache: Map<string, ts.SourceFile>
): { start: number; end: number } | null {
  let sf = astCache.get(file)
  if (!sf) {
    sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    astCache.set(file, sf)
  }
  const lineOf = (pos: number) =>
    sf!.getLineAndCharacterOfPosition(pos).line + 1
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const spanOfBody = (body: ts.ConciseBody): { start: number; end: number } => {
    if (ts.isBlock(body) && body.statements.length) {
      return {
        start: lineOf(body.statements[0].getStart(sf)),
        end: lineOf(body.statements[body.statements.length - 1].getEnd()),
      }
    }
    return { start: lineOf(body.getStart(sf)), end: lineOf(body.getEnd()) }
  }
  let span: { start: number; end: number } | null = null
  sf.forEachChild((node) => {
    if (span) return
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === exportedName &&
          decl.initializer
        ) {
          const body = innerBody(decl.initializer)
          span = body
            ? spanOfBody(body)
            : {
                start: lineOf(decl.initializer.getStart(sf)),
                end: lineOf(decl.initializer.getEnd()),
              }
        }
      }
    } else if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === exportedName &&
      isExported(node) &&
      node.body
    ) {
      span = spanOfBody(node.body)
    }
  })
  return span
}

function lineCoverage(
  fileCov: IstanbulFile | undefined,
  span: { start: number; end: number }
) {
  const covered = new Set<number>()
  const missed = new Set<number>()
  if (fileCov) {
    for (const id of Object.keys(fileCov.statementMap)) {
      const ln = fileCov.statementMap[id].start.line
      if (ln >= span.start && ln <= span.end) {
        if (fileCov.s[id] > 0) covered.add(ln)
        else missed.add(ln)
      }
    }
  }
  for (const ln of covered) missed.delete(ln)
  return {
    covered: [...covered].sort((a, b) => a - b),
    missed: [...missed].sort((a, b) => a - b),
  }
}

export const pikkuTestsCoverage = pikkuSessionlessFunc<
  { noRun?: boolean; aiOut?: string },
  void
>({
  func: async ({ logger, config }, input) => {
    const noRun = input?.noRun ?? false
    const aiOut = input?.aiOut ?? null

    const packageMappings = config.packageMappings ?? {}
    const srcDirs: string[] =
      (config as { srcDirectories?: string[] }).srcDirectories ?? []
    const functionsRelDir =
      Object.keys(packageMappings).find((key) =>
        srcDirs.some((src) => src === key || src.startsWith(key + '/'))
      ) ?? Object.keys(packageMappings)[0]

    if (!functionsRelDir) {
      logger.error(
        'packageMappings must have at least one entry pointing to your functions package'
      )
      process.exit(1)
    }

    const functionsDir = join(config.rootDir, functionsRelDir)
    const ftestDir = join(functionsDir, 'tests')

    if (!existsSync(ftestDir)) {
      logger.error(
        `tests directory not found at ${ftestDir}. Run 'pikku tests init' first.`
      )
      process.exit(1)
    }

    const verboseMetaPath = join(
      config.outDir,
      'function',
      'pikku-functions-meta-verbose.gen.json'
    )
    if (!existsSync(verboseMetaPath)) {
      logger.error(
        `Verbose metadata not found at ${verboseMetaPath}. Run 'pikku all' first.`
      )
      process.exit(1)
    }

    const coverageFinal = join(functionsDir, '.coverage', 'coverage-final.json')
    const outDir = join(ftestDir, '.coverage')
    const outFile = join(outDir, 'function-coverage.json')

    if (!noRun) {
      const findBin = (name: string, searchFrom: string): string => {
        let dir = searchFrom
        for (let i = 0; i < 6; i++) {
          const candidate = join(dir, 'node_modules', '.bin', name)
          if (existsSync(candidate)) return candidate
          const parent = dirname(dir)
          if (parent === dir) break
          dir = parent
        }
        return name // fallback: assume on PATH
      }

      const c8 = findBin('c8', ftestDir)
      const cucumber = findBin('cucumber-js', ftestDir)

      const envFile = join(ftestDir, '.env.test')
      const spawnEnv = { ...process.env }
      if (existsSync(envFile)) {
        for (const line of readFileSync(envFile, 'utf8').split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eq = trimmed.indexOf('=')
          if (eq < 0) continue
          spawnEnv[trimmed.slice(0, eq).trim()] = trimmed
            .slice(eq + 1)
            .trim()
            .replace(/^['"]|['"]$/g, '')
        }
      }

      logger.info('Running function tests under c8...')
      const res = spawnSync(
        process.execPath,
        [
          c8,
          '--src',
          'src',
          '--include',
          'src/**',
          '--report-dir',
          '.coverage',
          '--reporter',
          'json',
          '--reporter',
          'text-summary',
          cucumber,
          '--require-module',
          'tsx',
          '--require',
          'tests/tests/support/**/*.ts',
          'tests/tests/features/**/*.feature',
        ],
        { cwd: functionsDir, stdio: 'inherit', env: spawnEnv }
      )
      if (res.status !== 0) {
        logger.error(`Test run failed (exit ${res.status})`)
        process.exit(res.status ?? 1)
      }
    }

    if (!existsSync(coverageFinal)) {
      logger.error(
        `coverage-final.json not found at ${coverageFinal}. Run without --no-run.`
      )
      process.exit(1)
    }

    const coverage = JSON.parse(readFileSync(coverageFinal, 'utf8')) as Record<
      string,
      IstanbulFile
    >
    const meta = JSON.parse(readFileSync(verboseMetaPath, 'utf8')) as Record<
      string,
      {
        name: string
        sourceFile: string
        exportedName: string
        expose?: boolean
        description?: string
      }
    >

    const astCache = new Map<string, ts.SourceFile>()

    const functions = Object.values(meta)
      .filter((m) => m.sourceFile && !m.sourceFile.endsWith('.gen.ts'))
      .map((m) => {
        const span = bodySpan(m.sourceFile, m.exportedName, astCache)
        const { covered, missed } = span
          ? lineCoverage(coverage[m.sourceFile], span)
          : { covered: [], missed: [] }
        const total = covered.length + missed.length
        const ratio = total ? covered.length / total : 0
        const status: Status =
          total === 0
            ? 'unknown'
            : covered.length === 0
              ? 'uncovered'
              : missed.length === 0
                ? 'covered'
                : 'partial'
        return {
          name: m.name,
          sourceFile: relative(functionsDir, m.sourceFile),
          exposed: m.expose !== false,
          description: m.description ?? null,
          coveredLines: covered.length,
          totalLines: total,
          missedLines: missed,
          ratio: Number(ratio.toFixed(3)),
          status,
        }
      })
      .sort((a, b) => a.ratio - b.ratio || a.name.localeCompare(b.name))

    const summary = {
      total: functions.length,
      covered: 0,
      partial: 0,
      uncovered: 0,
      unknown: 0,
    }
    for (const f of functions) summary[f.status as Status]++
    const overallRatio = functions.length
      ? Number(
          (
            functions.reduce((a, f) => a + f.ratio, 0) / functions.length
          ).toFixed(3)
        )
      : 0

    mkdirSync(outDir, { recursive: true })
    writeFileSync(
      outFile,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          summary: { ...summary, overallRatio },
          functions,
        },
        null,
        2
      ) + '\n'
    )

    const uncovered = functions.filter((f) => f.status === 'uncovered')
    console.log(`\nFunction coverage → ${relative(config.rootDir, outFile)}`)
    console.log(
      `  ${summary.covered} covered · ${summary.partial} partial · ${summary.uncovered} uncovered · ${summary.unknown} unknown (overall ${(overallRatio * 100).toFixed(1)}%)`
    )
    if (uncovered.length)
      console.log(`  uncovered: ${uncovered.map((f) => f.name).join(', ')}`)

    if (aiOut !== null) {
      const generatedAt = new Date().toISOString()
      const pct = Math.round(overallRatio * 100)
      const needWork = functions.filter((f) => f.status !== 'covered')
      const lines: string[] = [
        `Coverage report — generated ${generatedAt}.`,
        `Overall: ${pct}% (${summary.covered}/${summary.total} functions fully covered)`,
        '',
        needWork.length === 0
          ? 'All functions are fully covered — nothing to do!'
          : `Functions needing coverage (${needWork.length}):`,
        ...needWork.flatMap((fn) => {
          const ratio = Math.round(fn.ratio * 100)
          const missed =
            fn.missedLines.length > 0 ? fn.missedLines.join(', ') : 'none'
          return [
            `- ${fn.name} [${fn.status}, ${ratio}% covered, ${fn.coveredLines}/${fn.totalLines} lines]`,
            `  file: ${fn.sourceFile}`,
            `  missed lines: ${missed}`,
          ]
        }),
      ]
      if (needWork.length > 0) {
        lines.push(
          '',
          'Write @pikku/cucumber Gherkin scenarios (no custom steps) in tests/tests/features/ to cover the missed lines above.',
          'Use pikku meta to get versioned RPC names and function schemas before writing.',
          'Run pikku tests coverage after writing to verify coverage improved.'
        )
      }
      const prompt = lines.join('\n') + '\n'
      if (aiOut === '-') {
        process.stdout.write(prompt)
      } else {
        writeFileSync(aiOut, prompt, 'utf-8')
        console.log(`AI prompt → ${relative(config.rootDir, aiOut)}`)
      }
    }
  },
})
