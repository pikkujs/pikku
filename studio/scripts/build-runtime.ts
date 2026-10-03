import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const builder = join(root, '..', 'packages', 'builder')
const pi = join(builder, 'node_modules', '@earendil-works', 'pi-coding-agent')
const out = join(root, '.deploy', 'studio-runtime.tar.gz')

const files: Record<string, Uint8Array | string> = {}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const add = (prefix: string, base: string, paths: string[]) => {
  for (const path of paths) files[join(prefix, relative(base, path))] = readFileSync(path)
}

add('pi', pi, ['package.json', 'README.md', 'CHANGELOG.md'].map((name) => join(pi, name)))
add('pi', pi, walk(join(pi, 'docs')))
add('pi', pi, walk(join(pi, 'dist')).filter((path) => !/\.(js|map|ts)$/.test(path)))
files['pi/dist/bundle/cli.js'] = readFileSync(join(pi, 'dist', 'bundle', 'cli.js'))
const entry = existsSync(join(pi, 'dist', 'bundle', 'cli-runtime.js')) ? 'cli-runtime.js' : 'cli.js'

const bundled = await Bun.build({
  entrypoints: [join(pi, 'dist', 'bundle', entry)],
  target: 'bun',
  plugins: [
    {
      name: 'static-jiti',
      setup(build) {
        build.onLoad({ filter: /jiti-static-loader-[^/]*\.js$/ }, () => ({
          contents: `import { createJiti } from 'jiti'\nexport { createJiti }\n`,
          loader: 'js',
        }))
      },
    },
  ],
})
if (!bundled.success) throw new AggregateError(bundled.logs, 'pi did not bundle')
if (bundled.outputs.length !== 1) throw new Error(`pi bundled into ${bundled.outputs.length} files, expected one`)
files[`pi/dist/bundle/${entry}`] = await bundled.outputs[0]!.text()

const extensions = join(builder, 'extensions')
add('extensions', extensions, walk(extensions).filter((path) => !path.endsWith('.test.mjs')))

await mkdir(dirname(out), { recursive: true })
await Bun.Archive.write(out, files, { compress: 'gzip' })
console.log(`${relative(root, out)}: ${Object.keys(files).length} files, ${(statSync(out).size / 1e6).toFixed(1)} MB`)
