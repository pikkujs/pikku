import { spawn } from 'node:child_process'
import { HarnessInfraError } from './finding.js'
import { redact } from './redact.js'

export type Git = (args: string[], input?: string) => Promise<string>

/** Git in `cwd`; a non-zero exit throws a `git` infra error with redacted stderr. */
export const gitIn =
  (cwd: string, binary = 'git'): Git =>
  (args, input) =>
    new Promise((done, fail) => {
      const child = spawn(binary, args, {
        cwd,
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      })
      let stdout = ''
      let stderr = ''
      child.stdout!.on('data', (chunk: Buffer) => (stdout += chunk))
      child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk))
      if (input !== undefined) child.stdin!.end(input)
      child.once('error', (error) =>
        fail(
          new HarnessInfraError(
            'git',
            `git ${args[0]} could not start: ${redact(error.message)}`
          )
        )
      )
      child.once('close', (code) =>
        code === 0
          ? done(stdout)
          : fail(
              new HarnessInfraError(
                'git',
                `git ${args[0]} exited ${code}: ${redact(stderr.trim().slice(-2_000))}`,
                { exitCode: code ?? -1 }
              )
            )
      )
    })
