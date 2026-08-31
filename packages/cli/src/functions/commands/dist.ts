import { existsSync } from 'node:fs'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { pikkuSessionlessFunc } from '#pikku/function'

/**
 * Carry into the build output the files `tsc` compiles around but never emits.
 *
 * `tsc` turns the generated `.ts` under the pikku out dir into JavaScript, so
 * that half arrives on its own. Two kinds of file do not:
 *
 *  - the `*.gen.json` meta pikku writes beside them. `resolveJsonModule` lets
 *    TypeScript *read* a json, it never copies one to `outDir`, and the meta is
 *    read off disk at runtime — `MetaService` opens it by path — so a package
 *    that ships only tsc's output answers every meta lookup with nothing.
 *  - a hand-authored `.d.ts` such as `types/application-types.d.ts`. A
 *    declaration file is an input, and `declaration: true` does not re-emit it.
 *
 * Packages used to do this with `cp -r .pikku types dist/`, which also dumped
 * every `.ts` source into the published output and needed a POSIX shell.
 */
export type DistCopy = { from: string; to: string }

/**
 * `tsc` compiles a `.ts` and emits it. Everything else it either reads without
 * emitting — a `.d.ts` is an input, `declaration: true` does not re-emit one —
 * or ignores entirely, like the generated json.
 */
const tscEmitsIt = (file: string) =>
  file.endsWith('.ts') && !file.endsWith('.d.ts')

const walk = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) {
    return []
  }
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
  )
  return files.flat()
}

export const planDistCopies = (
  rootDir: string,
  distDir: string,
  files: string[]
): DistCopy[] => {
  return files
    .filter((file) => !tscEmitsIt(file))
    .map((from) => ({
      from,
      to: join(distDir, relative(rootDir, from)),
    }))
}

const readTsOutDir = (tsconfig: string): string | undefined => {
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  } as ts.ParseConfigFileHost)
  return parsed?.options.outDir
}

export const pikkuDist = pikkuSessionlessFunc<{ distDir?: string }, void>({
  func: async ({ logger, config }, data) => {
    const { rootDir, outDir, srcDirectories, tsconfig } = config as any

    const distDir = data.distDir
      ? resolve(rootDir, data.distDir)
      : readTsOutDir(resolve(rootDir, tsconfig))

    if (!distDir) {
      logger.error(
        `${tsconfig} sets no compilerOptions.outDir, so there is nowhere to copy to. Set one, or pass --dist-dir.`
      )
      process.exit(1)
    }

    const copies = planDistCopies(rootDir, distDir, [
      ...(await walk(outDir)),
      ...(
        await Promise.all(
          srcDirectories.map((dir: string) => walk(resolve(rootDir, dir)))
        )
      ).flat(),
    ])

    for (const { from, to } of copies) {
      await mkdir(dirname(to), { recursive: true })
      await cp(from, to)
    }

    logger.info(
      `Copied ${copies.length} generated file(s) into ${relative(rootDir, distDir) || distDir}`
    )
  },
})
