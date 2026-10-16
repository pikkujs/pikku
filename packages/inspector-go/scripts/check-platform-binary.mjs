// Refuses to publish a platform package without its binary.
//
//   node ../../scripts/check-platform-binary.mjs   from npm/<target> (prepublishOnly)
//   node scripts/check-platform-binary.mjs --all   every npm/<target>
//
// The binary must exist, be large enough to be real, and be an executable for
// the os/cpu the package.json declares: Mach-O, static ELF (no PT_INTERP) or PE
// with the matching machine. A wrong-target binary would install cleanly and
// fail only when a user runs codegen.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORMS, executableName, targetName } from './platforms.mjs'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIN_BYTES = 1024 * 1024

const MACHO_CPU = { arm64: 0x0100000c, x64: 0x01000007 }
const ELF_MACHINE = { arm64: 183, x64: 62 }
const PE_MACHINE = { arm64: 0xaa64, x64: 0x8664 }

/** Returns why `buf` is not an executable for platform/arch, or undefined. */
export const binaryProblem = (buf, platform, arch) => {
  if (buf.length < MIN_BYTES) {
    return `only ${buf.length} bytes, expected a real binary (>= ${MIN_BYTES})`
  }
  if (platform === 'darwin') {
    if (buf.readUInt32LE(0) !== 0xfeedfacf) return 'not a 64-bit Mach-O binary'
    const cpu = buf.readUInt32LE(4)
    if (cpu !== MACHO_CPU[arch]) {
      return `Mach-O cputype 0x${cpu.toString(16)}, expected ${arch}`
    }
    return undefined
  }
  if (platform === 'linux') {
    if (buf.readUInt32BE(0) !== 0x7f454c46) return 'not an ELF binary'
    if (buf[4] !== 2) return 'not a 64-bit ELF binary'
    const machine = buf.readUInt16LE(18)
    if (machine !== ELF_MACHINE[arch]) {
      return `ELF e_machine ${machine}, expected ${arch}`
    }
    const phoff = Number(buf.readBigUInt64LE(32))
    const phentsize = buf.readUInt16LE(54)
    const phnum = buf.readUInt16LE(56)
    for (let i = 0; i < phnum; i++) {
      const PT_INTERP = 3
      if (buf.readUInt32LE(phoff + i * phentsize) === PT_INTERP) {
        return 'dynamically linked (has PT_INTERP); build with CGO_ENABLED=0'
      }
    }
    return undefined
  }
  if (platform === 'win32') {
    if (buf.toString('latin1', 0, 2) !== 'MZ') return 'not a PE binary'
    const pe = buf.readUInt32LE(0x3c)
    if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') {
      return 'no PE signature'
    }
    const machine = buf.readUInt16LE(pe + 4)
    if (machine !== PE_MACHINE[arch]) {
      return `PE machine 0x${machine.toString(16)}, expected ${arch}`
    }
    return undefined
  }
  return `unsupported platform ${platform}`
}

const checkPackage = (dir) => {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const [platform] = pkg.os ?? []
  const [arch] = pkg.cpu ?? []
  const binary = join(dir, 'bin', executableName(platform))
  const where = relative(process.cwd(), binary) || binary
  let buf
  try {
    if (!statSync(binary).isFile()) throw new Error('not a file')
    buf = readFileSync(binary)
  } catch {
    return `${pkg.name}: ${where} is missing. Run \`node scripts/build-go.mjs --target ${platform}-${arch}\` in packages/inspector-go first.`
  }
  if (platform !== 'win32' && (statSync(binary).mode & 0o111) === 0) {
    return `${pkg.name}: ${where} is not executable`
  }
  const problem = binaryProblem(buf, platform, arch)
  if (problem) return `${pkg.name}: ${where} ${problem}`
  console.log(
    `✓ ${pkg.name}: ${where} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`
  )
  return undefined
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const dirs = process.argv.includes('--all')
    ? PLATFORMS.map((p) => join(PKG_DIR, 'npm', targetName(p)))
    : [process.cwd()]
  if (process.argv.includes('--all')) {
    const onDisk = readdirSync(join(PKG_DIR, 'npm')).sort()
    const expected = PLATFORMS.map(targetName).sort()
    if (onDisk.join() !== expected.join()) {
      console.error(
        `npm/ holds ${onDisk.join(', ')} but scripts/platforms.mjs lists ${expected.join(', ')}`
      )
      process.exit(1)
    }
  }
  const problems = dirs.map(checkPackage).filter(Boolean)
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
}
