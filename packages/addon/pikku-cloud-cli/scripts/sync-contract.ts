#!/usr/bin/env bun
/**
 * Materialises the cloud API contract into the gitignored `.pikku/contract/`.
 * Runs from the package's `prebuild`; nothing it writes is committed.
 *
 *   bun scripts/sync-contract.ts                 fetch what contract.lock.json pins
 *   bun scripts/sync-contract.ts --update        re-pin to the latest published version
 *   bun scripts/sync-contract.ts --update 0.0.3  re-pin to a version or range
 *   bun scripts/sync-contract.ts --tarball f.tgz use a local SDK instead of the registry
 *
 * `contract.lock.json` (package, version, contractHash, integrity) is the only
 * committed part. A fetch whose sha512 or contractHash differs from the pin
 * fails; there is no fallback to a stale copy. When `.pikku/contract` already
 * holds the pinned integrity the registry is not called, so a built checkout
 * works offline.
 *
 * The registry is the one `wireRemoteAddon` packages resolve against:
 * `POST /rpc/registry:resolveSdk`, a public read that needs no credential.
 *
 * Writes `.pikku/contract/cloud-api.d.ts` (rpc map types, bare function names),
 * `functions.json` (the names) and `.stamp` (the pinned integrity).
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = join(root, 'contract.lock.json')
const outDir = join(root, '.pikku/contract')
const MAP_ENTRY = 'rpc/pikku-rpc-wirings-map.remote.gen.d.ts'
const META_ENTRY = 'function/pikku-functions-meta.gen.json'
const MAP_CUT = '// No addon packages, use RPCMap directly'

type Lock = {
  package: string
  version: string
  contractHash: string
  integrity: string
}

const args = process.argv.slice(2)
const flag = (name: string) => args.indexOf(`--${name}`)
const update = flag('update') !== -1
const updateRange = update ? args[flag('update') + 1] : undefined
const tarballArg =
  flag('tarball') !== -1 ? args[flag('tarball') + 1] : undefined
const registry = (
  (flag('registry') !== -1 ? args[flag('registry') + 1] : undefined) ??
  process.env.PIKKU_CONTRACT_REGISTRY ??
  'https://api.pikkustudio.app'
).replace(/\/$/, '')

const fail = (message: string): never => {
  console.error(`sync-contract: ${message}`)
  process.exit(1)
}

const sha512 = (data: Buffer) =>
  `sha512-${createHash('sha512').update(data).digest('base64')}`

const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Lock

if (
  !update &&
  !tarballArg &&
  existsSync(join(outDir, '.stamp')) &&
  readFileSync(join(outDir, '.stamp'), 'utf8').trim() === lock.integrity
) {
  console.log(
    `sync-contract: ${lock.package}@${lock.version} already in .pikku/contract`
  )
  process.exit(0)
}

async function obtain(
  range: string
): Promise<{ file: string; integrity: string }> {
  if (tarballArg) {
    return {
      file: resolve(tarballArg),
      integrity: sha512(readFileSync(tarballArg)),
    }
  }
  let res: Response
  try {
    res = await fetch(`${registry}/rpc/registry:resolveSdk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rpcName: 'registry:resolveSdk',
        data: { name: lock.package, range },
      }),
    })
  } catch (error) {
    return fail(
      `cannot reach the registry at ${registry} (${(error as Error).message}). The cloud contract is fetched on the first build of a checkout; connect once, or pass --tarball.`
    )
  }
  if (!res.ok)
    return fail(`resolveSdk ${lock.package}@${range}: HTTP ${res.status}`)
  const { url, integrity } = (await res.json()) as {
    url: string
    integrity: string
  }
  const dl = await fetch(url)
  if (!dl.ok) return fail(`download failed: HTTP ${dl.status}`)
  const bytes = Buffer.from(await dl.arrayBuffer())
  if (sha512(bytes) !== integrity)
    fail('the download does not match the integrity the registry reported')
  const file = join(mkdtempSync(join(tmpdir(), 'cloud-api-sdk-')), 'sdk.tgz')
  writeFileSync(file, bytes)
  return { file, integrity }
}

function entry(tarball: string, path: string): string {
  const r = spawnSync('tar', ['-xzOf', tarball, path], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) return fail(`${tarball} has no ${path}`)
  return r.stdout
}

const { file, integrity } = await obtain(
  update ? (updateRange ?? '*') : lock.version
)
const manifest = JSON.parse(entry(file, 'manifest.json')) as {
  name: string
  version: string
  contractHash: string
}
if (manifest.name !== lock.package)
  fail(`expected ${lock.package}, got ${manifest.name}`)

if (update || tarballArg) {
  const next: Lock = {
    package: lock.package,
    version: manifest.version,
    contractHash: manifest.contractHash,
    integrity,
  }
  if (update) {
    writeFileSync(lockPath, `${JSON.stringify(next, null, 2)}\n`)
    console.log(
      `sync-contract: pinned ${next.package}@${next.version}; commit contract.lock.json`
    )
  }
  Object.assign(lock, next)
} else if (
  integrity !== lock.integrity ||
  manifest.contractHash !== lock.contractHash
) {
  fail(
    `${lock.package}@${lock.version} from the registry does not match contract.lock.json (integrity or contractHash differs). Refusing a stale or altered contract; run \`bun run sync-contract --update\` to re-pin deliberately.`
  )
}

const map = entry(file, MAP_ENTRY)
const cut = map.indexOf(MAP_CUT)
if (cut === -1)
  fail(`${MAP_ENTRY} has no "${MAP_CUT}" marker; the SDK layout changed`)
const types = `${map.slice(0, cut).trimEnd()}\n\nexport type FlattenedRPCMap = RPCMap\n`
const meta = JSON.parse(entry(file, META_ENTRY)) as Record<
  string,
  { remote?: boolean }
>
const names = Object.keys(meta)
  .filter((n) => meta[n]!.remote)
  .sort()
const mapKeys = [
  ...types.matchAll(/^\s*readonly '?([A-Za-z0-9_]+)'?: RPCHandler</gm),
]
  .map((m) => m[1]!)
  .sort()
if (JSON.stringify(names) !== JSON.stringify(mapKeys))
  fail('the contract meta and the rpc map list different functions')

mkdirSync(outDir, { recursive: true })
writeFileSync(
  join(outDir, 'cloud-api.d.ts'),
  `// Generated by scripts/sync-contract.ts from ${lock.package}@${lock.version}. Not committed.\n${types}`
)
writeFileSync(join(outDir, 'functions.json'), `${JSON.stringify(names)}\n`)
writeFileSync(join(outDir, '.stamp'), `${lock.integrity}\n`)
console.log(
  `sync-contract: ${lock.package}@${lock.version} (${names.length} functions) -> .pikku/contract/`
)
