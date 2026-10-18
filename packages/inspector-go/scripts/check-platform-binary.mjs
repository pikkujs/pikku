// Refuses to publish @pikku/inspector-go without every prebuilt binary.
//
//   node scripts/check-platform-binary.mjs   every prebuilt/<target> (prepublishOnly)
//
// Each binary must exist, be large enough to be real, and be an executable for
// its target: Mach-O, static ELF (no PT_INTERP) or PE with the matching
// machine. A missing or wrong-target binary would install cleanly and fail only
// when a user on that platform runs codegen.
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

const checkTarget = ({ platform, arch }) => {
  const binary = join(
    PKG_DIR,
    'prebuilt',
    targetName({ platform, arch }),
    executableName(platform)
  )
  const where = relative(process.cwd(), binary) || binary
  let buf
  try {
    if (!statSync(binary).isFile()) throw new Error('not a file')
    buf = readFileSync(binary)
  } catch {
    return `${where} is missing. Run \`node scripts/build-go.mjs --all\` in packages/inspector-go first.`
  }
  if (platform !== 'win32' && (statSync(binary).mode & 0o111) === 0) {
    return `${where} is not executable`
  }
  const problem = binaryProblem(buf, platform, arch)
  if (problem) return `${where} ${problem}`
  console.log(`✓ ${where} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
  return undefined
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const problems = []
  let onDisk = []
  try {
    onDisk = readdirSync(join(PKG_DIR, 'prebuilt')).sort()
  } catch {
    // reported per target below
  }
  const expected = PLATFORMS.map(targetName).sort()
  const unknown = onDisk.filter((t) => !expected.includes(t))
  if (unknown.length > 0) {
    problems.push(
      `prebuilt/ holds ${unknown.join(', ')}, which scripts/platforms.mjs does not list`
    )
  }
  problems.push(...PLATFORMS.map(checkTarget).filter(Boolean))
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
}
