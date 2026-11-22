import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ValidateFinding } from './virtual-user-checks.js'

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
]

/** The `/api` entry of a Vite `server.proxy` block, up to the next sibling key. */
const API_PROXY_ENTRY = /['"`]\/api['"`]\s*:\s*\{([\s\S]*?)\n\s{0,8}\}/

export type DevProxyInput = {
  root: string
  /** Whether the analytics origin lock is on, which is what reads the forwarded protocol. */
  originLockOn: boolean
  /** Vite config files to inspect, as paths relative to `root`. */
  viteConfigs: string[]
  read: (path: string) => Promise<string>
}

/**
 * Reports a Vite dev proxy for `/api` that does not set `xfwd: true`.
 *
 * The analytics origin lock compares the browser's `Origin` with one built from
 * the request's `Host` and `x-forwarded-proto`, assuming `https` when the header
 * is missing. A dev proxy that forwards neither sends `http://localhost:…`
 * against an expected `https://localhost:…`, so every beacon is a 403 that
 * looks like a CORS problem.
 */
export async function runDevProxyChecks(
  input: DevProxyInput
): Promise<ValidateFinding[]> {
  if (!input.originLockOn) return []
  const findings: ValidateFinding[] = []
  for (const file of input.viteConfigs) {
    const path = join(input.root, file)
    const entry = API_PROXY_ENTRY.exec(await input.read(path))
    if (!entry || /\bxfwd\s*:\s*true\b/.test(entry[1]!)) continue
    findings.push({
      id: 'dev-proxy-missing-xfwd',
      severity: 'error',
      message: `The /api dev proxy in ${file} does not set xfwd: true, so the analytics origin lock rejects every beacon from the dev server with a 403`,
      path,
      fixHint:
        "Add `xfwd: true` to the '/api' entry of server.proxy, beside changeOrigin: false. It makes the proxy send x-forwarded-proto and x-forwarded-host, which the origin lock reads",
    })
  }
  return findings
}

/** `apps/*` Vite configs, relative to the project root. */
export async function findViteConfigs(root: string): Promise<string[]> {
  const appsDir = join(root, 'apps')
  if (!existsSync(appsDir)) return []
  const found: string[] = []
  for (const app of await readdir(appsDir, { withFileTypes: true })) {
    if (!app.isDirectory()) continue
    for (const name of VITE_CONFIG_NAMES) {
      const rel = join('apps', app.name, name)
      if (existsSync(join(root, rel))) found.push(rel)
    }
  }
  return found
}

export const readViteConfig = (path: string) => readFile(path, 'utf8')
