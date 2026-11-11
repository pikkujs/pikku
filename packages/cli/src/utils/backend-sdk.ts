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
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import semver from 'semver'
import type { InspectorState } from '@pikku/inspector'
import type { Logger } from '@pikku/core/services'
import type { PikkuClientSdkFiles, PikkuCLIConfig } from '../../types/config.js'
import {
  buildSdkFiles,
  listImportSpecifiers,
  readPackageInfo,
  sdkTarballName,
} from './addon-sdk.js'
import { serializeSdkSources } from './addon-sdk-sources.js'
import { packTarGz } from './sdk-tarball.js'

/**
 * A backend's SDKs.
 *
 * The backend's own `pikku all` pass writes them inside its output directory
 * (`.pikku/backends/<name>/sdk/`), the only place that pass may write. The
 * parent then moves them to `.pikku/sdk/<name>/`:
 *
 *   exposed/   the clients (fetch, rpc, websocket, react-query, realtime,
 *              queue, scopes) and, under contract/, the maps they are typed by,
 *              all cut from the backend's `expose: true` functions
 *   remote/    a types-only contract cut from its `remote: true` functions, in
 *              the shape of an addon SDK; present only when it has any
 *
 * Frontends consume `exposed/`; `remote/` is for other backends and the
 * registry.
 *
 * knowledge: a-backend-generates-an-exposed-and-a-remote-sdk
 */

export const SDK_ROOT = ['.pikku', 'sdk']
const EXPOSED = 'exposed'
const REMOTE = 'remote'
const CONTRACT = 'contract'
const SUMMARY = 'summary.json'
const MANIFEST = 'manifest.json'

/** Where a backend's SDKs end up. */
export const backendSdkDir = (projectDir: string, backend: string) =>
  join(projectDir, ...SDK_ROOT, backend)

/** Where the backend's own pass writes its SDKs, inside its output directory. */
export const backendPassSdkDir = (backendOutDir: string) =>
  join(backendOutDir, 'sdk')

/** The client files a backend pass writes, under `<outDir>/sdk/exposed/`. */
export const exposedClientFiles = (
  backendOutDir: string
): PikkuClientSdkFiles => {
  const dir = join(backendPassSdkDir(backendOutDir), EXPOSED)
  return {
    fetchFile: join(dir, 'pikku-fetch.gen.ts'),
    websocketFile: join(dir, 'pikku-websocket.gen.ts'),
    rpcWiringsFile: join(dir, 'pikku-rpc.gen.ts'),
    reactQueryFile: join(dir, 'pikku-react-query.gen.ts'),
    realtimeFile: join(dir, 'pikku-realtime.gen.ts'),
    queueWiringsFile: join(dir, 'pikku-queue.gen.ts'),
    scopesFile: join(dir, 'pikku-scope-client.gen.ts'),
  }
}

/**
 * The two client files frontend glue (`nextBackendFile`, `tanstackStartFile`,
 * `rpcFile`) imports, at their final place. The glue sits in the frontend's
 * source, which only the parent pass may write, so the parent writes these two
 * where the SDK will be and the backend pass's SDK replaces them.
 */
export const finalGlueClientFiles = (
  projectDir: string,
  backend: string
): PikkuClientSdkFiles => {
  const dir = join(backendSdkDir(projectDir, backend), EXPOSED)
  return {
    fetchFile: join(dir, 'pikku-fetch.gen.ts'),
    rpcWiringsFile: join(dir, 'pikku-rpc.gen.ts'),
  }
}

const specifierFile = (fromDir: string, specifier: string) => {
  const base = resolve(fromDir, specifier)
  const candidates = specifier.endsWith('.d.js')
    ? [base.replace(/\.d\.js$/, '.d.ts')]
    : /\.[cm]?jsx?$/.test(specifier)
      ? [
          base.replace(/\.([cm]?)js$/, '.$1ts'),
          base.replace(/\.js$/, '.tsx'),
          base.replace(/\.js$/, '.d.ts'),
        ]
      : [base, `${base}.ts`, join(base, 'index.ts')]
  return candidates.find((c) => existsSync(c) && statSync(c).isFile())
}

const toSpecifier = (
  fromFile: string,
  targetFile: string,
  original: string
) => {
  let rel = posix.relative(
    dirname(fromFile).split(sep).join('/'),
    targetFile.split(sep).join('/')
  )
  if (!rel.startsWith('.')) rel = `./${rel}`
  if (original.endsWith('.d.js')) return rel.replace(/\.d\.ts$/, '.d.js')
  if (/\.[cm]?js$/.test(original)) {
    return rel.replace(/\.d\.ts$|\.[cm]?tsx?$/, '.js')
  }
  return rel
}

const filesIn = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? filesIn(join(dir, entry.name))
          : [join(dir, entry.name)]
      )
    : []

/**
 * Move the backend pass's `exposed/` files, and every file of the pass they
 * reach by relative import, to `<sdkDir>/exposed/`. Imports are re-pointed at
 * the new places; imports of project source (outside the pass) keep their
 * target and only change spelling.
 */
const relocateExposed = (backendOutDir: string, sdkDir: string): string[] => {
  const fromExposed = join(backendPassSdkDir(backendOutDir), EXPOSED)
  const toExposed = join(sdkDir, EXPOSED)
  const place = (file: string) => {
    const inExposed = relative(fromExposed, file)
    if (!inExposed.startsWith('..')) return join(toExposed, inExposed)
    return join(toExposed, CONTRACT, relative(backendOutDir, file))
  }
  const inPass = (file: string) =>
    !relative(backendOutDir, file).startsWith('..')

  const queue = filesIn(fromExposed).filter((f) => /\.tsx?$/.test(f))
  const seen = new Set(queue)
  const written: string[] = []
  while (queue.length > 0) {
    const file = queue.shift()!
    const newFile = place(file)
    let content = readFileSync(file, 'utf-8')
    for (const specifier of new Set(listImportSpecifiers(content))) {
      if (!specifier.startsWith('.')) continue
      const target = specifierFile(dirname(file), specifier)
      const targetOnDisk = target ?? resolve(dirname(file), specifier)
      let newTarget = targetOnDisk
      if (target && inPass(target)) {
        newTarget = place(target)
        if (!seen.has(target) && /\.tsx?$/.test(target)) {
          seen.add(target)
          queue.push(target)
        }
      }
      const next = toSpecifier(newFile, newTarget, specifier)
      content = content.replace(
        new RegExp(
          `(['"])${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`,
          'g'
        ),
        (_m, quote) => `${quote}${next}${quote}`
      )
    }
    mkdirSync(dirname(newFile), { recursive: true })
    writeFileSync(newFile, content, 'utf-8')
    written.push(relative(sdkDir, newFile).split(sep).join('/'))
  }
  return written.sort()
}

interface PassSummary {
  exposed: string[]
  remote: string[]
}

/**
 * Written by a backend pass, after the clients: the `remote/` SDK, cut with the
 * addon SDK machinery from this backend's `remote: true` functions, and a
 * summary the parent reads. A cut that cannot be made (a remote function typed
 * by a TypeScript type the SDK cannot carry) is a warning, unless the backend
 * publishes, where it is an error.
 */
export const writeBackendPassSdk = (
  logger: Logger,
  state: Pick<
    InspectorState,
    'functions' | 'rpc' | 'resolvedIOTypes' | 'workflows'
  >,
  config: PikkuCLIConfig,
  backend: string
): PassSummary => {
  const passSdk = backendPassSdkDir(config.outDir)
  rmSync(join(passSdk, REMOTE), { recursive: true, force: true })
  const summary: PassSummary = {
    exposed: Object.keys(state.rpc.exposedMeta).sort(),
    remote: Object.keys(state.rpc.remoteMeta).sort(),
  }
  const publish = config.backends?.[backend]?.publish === true

  if (summary.remote.length > 0) {
    try {
      const info = readPackageInfo(join(config.rootDir, 'package.json'))
      if (publish) assertPublishable(backend, info)
      const { files } = buildSdkFiles(
        serializeSdkSources(logger, state, config),
        {
          name: `${info.name}-${backend}`,
          version: info.version ?? '0.0.0',
          pikkuCore: info.pikkuCore ?? '*',
        }
      )
      for (const [path, content] of files) {
        const target = join(passSdk, REMOTE, path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content, 'utf-8')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (publish) throw err
      logger.warn(
        `No remote SDK for backend '${backend}': ${message} Its exposed SDK is unaffected.`
      )
    }
  }
  mkdirSync(passSdk, { recursive: true })
  writeFileSync(
    join(passSdk, SUMMARY),
    JSON.stringify(summary, null, 2) + '\n',
    'utf-8'
  )
  return summary
}

const assertPublishable = (
  backend: string,
  info: { name: string; version?: string; pikkuCore?: string }
) => {
  if (!info.version || !semver.valid(info.version)) {
    throw new Error(
      `backends.${backend}.publish is true, but package.json version '${info.version ?? ''}' is not a semver version.`
    )
  }
  if (!info.pikkuCore) {
    throw new Error(
      `backends.${backend}.publish is true, but package.json declares no @pikku/core in peerDependencies or dependencies, so the SDK cannot state the core range it was built against.`
    )
  }
}

export interface AssembledBackendSdk {
  dir: string
  exposed: string[]
  remote: string[]
  tarball?: string
}

/**
 * Move a finished backend pass's SDKs to `.pikku/sdk/<backend>/` and, for a
 * backend that opts in with `publish: true`, pack its `remote/` SDK beside
 * package.json. Publishing fails closed: a backend with no remote functions
 * refuses rather than shipping an empty contract.
 */
export const assembleBackendSdk = (options: {
  projectDir: string
  rootDir: string
  backend: string
  backendOutDir: string
  publish: boolean
}): AssembledBackendSdk => {
  const { projectDir, rootDir, backend, backendOutDir, publish } = options
  const summaryFile = join(backendPassSdkDir(backendOutDir), SUMMARY)
  const summary: PassSummary = existsSync(summaryFile)
    ? JSON.parse(readFileSync(summaryFile, 'utf-8'))
    : { exposed: [], remote: [] }

  if (publish && summary.remote.length === 0) {
    throw new Error(
      `backends.${backend}.publish is true, but '${backend}' has no remote functions. Mark the functions other backends may call with remote: true, or remove publish.`
    )
  }

  const dir = backendSdkDir(projectDir, backend)
  rmSync(dir, { recursive: true, force: true })
  const exposedFiles = relocateExposed(backendOutDir, dir)

  const remoteFiles = filesIn(join(backendPassSdkDir(backendOutDir), REMOTE))
  for (const file of remoteFiles) {
    const target = join(
      dir,
      REMOTE,
      relative(join(backendPassSdkDir(backendOutDir), REMOTE), file)
    )
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(file, target)
  }
  if (publish && remoteFiles.length === 0) {
    throw new Error(
      `backends.${backend}.publish is true, but the remote SDK of '${backend}' could not be cut; see the warning above.`
    )
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, MANIFEST),
    JSON.stringify(
      { backend, exposed: summary.exposed, remote: summary.remote },
      null,
      2
    ) + '\n',
    'utf-8'
  )

  let tarball: string | undefined
  if (publish) {
    const info = readPackageInfo(join(rootDir, 'package.json'))
    assertPublishable(backend, info)
    tarball = join(
      rootDir,
      sdkTarballName(`${info.name}-${backend}`, info.version!)
    )
    writeFileSync(
      tarball,
      packTarGz(
        remoteFiles.map((file) => ({
          path: relative(join(backendPassSdkDir(backendOutDir), REMOTE), file)
            .split(sep)
            .join('/'),
          content: readFileSync(file),
        }))
      )
    )
  }
  return { dir, exposed: exposedFiles, remote: summary.remote, tarball }
}

/** The react-query client of a project's only (or first) backend, if it has one. */
export const reactQueryClientFile = (
  rootDir: string,
  backends: Record<string, unknown> | undefined
): string | undefined => {
  const first = Object.keys(backends ?? {})[0]
  return first
    ? join(backendSdkDir(rootDir, first), EXPOSED, 'pikku-react-query.gen.ts')
    : undefined
}
