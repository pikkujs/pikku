#!/usr/bin/env node
// A stand-in tool for runCli tests. The first argument picks what it does.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// built at runtime so the repository holds no secret-shaped literal
const secret = ['AK', 'IA', 'FAKE', 'FAKE', 'FAKE', 'FAKE'].join('')
const [mode, ...rest] = process.argv.slice(2)

const finding = (message) =>
  JSON.stringify({
    diagnostics: [
      {
        message,
        code: 'eslint(no-secret)',
        severity: 'error',
        filename: 'a.ts',
      },
    ],
  })

switch (mode) {
  case 'secret-finding':
    process.stdout.write(finding(`leaked ${secret} here`))
    process.exit(1)
  case 'secret-garbled':
    process.stdout.write(`not json at all ${secret}\n`)
    process.exit(0)
  case 'secret-exit':
    process.stderr.write(`fatal: password=${secret.toLowerCase()}xyz\n`)
    process.exit(3)
  case 'decorated':
    process.stdout.write(
      '\u001b[32m██████╗ ██╗\u001b[0m\n' +
        '[=====>     ] 40%\r[==========] 100%\n' +
        '\u001b[31mbroken\u001b[0m output\n'
    )
    process.exit(5)
  case 'clean':
    process.stdout.write(JSON.stringify({ diagnostics: [] }))
    process.exit(0)
  case 'env':
    process.stdout.write(
      finding(`env ${process.env.HARNESS_TEST_TOKEN ?? 'unset'}`)
    )
    process.exit(0)
  case 'sleep':
    // sleep [ms]: 30 s unless given
    setTimeout(() => process.exit(0), Number(rest[0] ?? 30_000))
    break
  case 'spawn-sleep': {
    // spawn-sleep <file>: starts a child that never ends, writes its pid to the file, then sleeps
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        stdio: 'ignore',
      }
    )
    writeFileSync(rest[0], `${child.pid}`)
    setTimeout(() => process.exit(0), 30_000)
    break
  }
  case 'write-later':
    // write-later <file> <ms>: writes the file only if it is still running after <ms>
    setTimeout(() => {
      writeFileSync(rest[0], 'late\n')
      process.stdout.write(JSON.stringify({ diagnostics: [] }))
      process.exit(0)
    }, Number(rest[1]))
    break
  case 'write':
    // write <file> <content>
    writeFileSync(rest[0], rest[1] ?? '')
    process.exit(0)
  default:
    process.stderr.write(`unknown mode ${mode}\n`)
    process.exit(64)
}
