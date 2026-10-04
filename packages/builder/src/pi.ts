import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface BuilderAi {
  provider?: string
  model?: string
  proxy?: { url: string; key: string }
}

export const EXTENSIONS = ['proxy-provider.mjs', 'codegen-diagnostics.mjs', 'edit-files-extension.mjs', 'write-files-extension.mjs', 'navigate-extension.mjs']

export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export const extensionsDir = () => process.env.PIKKU_BUILDER_EXTENSIONS ?? join(packageRoot, 'extensions')

export const extensionPaths = () => EXTENSIONS.map((name) => join(extensionsDir(), name))

export const SYSTEM_PROMPT = [
  'You are building a pikku app in the current directory.',
  'Before writing code for a part of the app, read the pikku skill for it (pikku-build first).',
  'Write code the way the skills show, keep generated files (.pikku/, *.gen.*) untouched,',
  'and check your work with `pikku all` once a batch of changes is done.',
  'Work arrives as changes, grouped into changesets: `pikku changes next` picks the work and the builder hands it to you.',
  'Build one changeset, commit each change on its own, mark it done and stop; the builder merges it and starts the next.',
].join(' ')

const PROVIDERS: Record<string, string> = { gemini: 'google' }

export function piArgs(options: { ai?: BuilderAi; skills: string; mode?: 'rpc'; session?: string }): string[] {
  const args: string[] = []
  if (options.mode) args.push('--mode', options.mode)
  args.push('--approve', '--skill', options.skills, '--append-system-prompt', SYSTEM_PROMPT)
  for (const path of extensionPaths()) args.push('-e', path)
  if (options.session) args.push('--session-id', options.session)
  if (options.ai?.proxy) args.push('--provider', 'pikku-proxy')
  else if (options.ai?.provider) args.push('--provider', PROVIDERS[options.ai.provider] ?? options.ai.provider)
  if (options.ai?.model) args.push('--model', options.ai.model)
  return args
}

export const piEnv = (ai?: BuilderAi): Record<string, string> =>
  ai?.proxy && ai.model
    ? { PIKKU_BUILDER_PROXY_URL: ai.proxy.url, PIKKU_BUILDER_PROXY_KEY: ai.proxy.key, PIKKU_BUILDER_PROXY_MODEL: ai.model }
    : {}

export function packageDir(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)))
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir)
  return dir
}

export function resolvePi(): string {
  const dir = piPackageRoot()
  const bin = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).bin
  const relative = typeof bin === 'string' ? bin : bin?.pi
  if (!relative) throw new Error('The installed pi has no command to run')
  return join(dir, relative)
}

export const piPackageRoot = () => process.env.PIKKU_PI_ROOT ?? packageDir('@earendil-works/pi-coding-agent')
