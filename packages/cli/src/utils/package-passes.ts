import {
  runPikkuAllChild,
  resolvePikkuBin,
} from '../deploy/codegen/per-unit-codegen.js'

/**
 * A pass over an addon or the main package is its own `pikku all`, run from its directory.
 * The environment flag tells it that a root project asked for the run: the
 * package needs no `backends` or `frontends` of its own, and builds none.
 */
export const PACKAGE_PASS_ENV = 'PIKKU_PACKAGE_PASS'

export type ListedPackage = { entry: string; dir: string }

export class PikkuPackagePassError extends Error {
  constructor(
    readonly entry: string,
    readonly exitCode: number | string | undefined,
    output: string
  ) {
    super(
      `pikku all failed in ${entry} (exit code ${exitCode ?? 'unknown'}).${output ? `\n${output}` : ''}`
    )
    this.name = 'PikkuPackagePassError'
  }
}

/**
 * Run `pikku all` in each package, one after the other in the order given
 * (addons by their dependencies, then the main package), and stop at the first that fails with that
 * package's exit code and output.
 */
export const runPikkuPackagePasses = async (
  packages: ListedPackage[],
  onPass?: (pkg: ListedPackage) => void
): Promise<void> => {
  const pikkuBin = resolvePikkuBin()
  for (const pkg of packages) {
    onPass?.(pkg)
    try {
      await runPikkuAllChild(pikkuBin, pkg.dir, [], {
        deployCodegen: false,
        timeoutMs: 0,
        env: { [PACKAGE_PASS_ENV]: '1' },
      })
    } catch (error) {
      const failure = error as {
        code?: number | string
        stdout?: string
        stderr?: string
      }
      throw new PikkuPackagePassError(
        pkg.entry,
        failure.code,
        [failure.stdout, failure.stderr].filter(Boolean).join('\n').trim()
      )
    }
  }
}
